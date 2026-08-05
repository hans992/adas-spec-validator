/**
 * Step-based background jobs for large model imports and validations.
 *
 * A job never lives inside one long serverless request. Each worker tick claims
 * a due job, executes exactly one phase (parsing → validating → persisting),
 * saves the intermediate state, and re-queues the job for the next tick. Ticks
 * come from the browser polling the job status and from the internal runner
 * endpoint (cron), so progress continues even after a page refresh.
 *
 * Guarantees:
 * - Idempotent: enqueue deduplicates by (project, Idempotency-Key); persisted
 *   artifacts reuse the run/model idempotency keys, so a retried persist phase
 *   never duplicates rows.
 * - Retries only for safe errors (network/5xx/lease expiry). Deterministic
 *   failures such as invalid input or parser timeouts fail immediately.
 * - Dead-letter: retryable errors that exhaust max_attempts are marked with
 *   dead_lettered_at for operator triage.
 * - Cancellation: checked before every phase.
 * - Timeout: a wall-clock budget per attempt plus a claim lease so a crashed
 *   worker can never wedge a job.
 * - Temp cleanup: the uploaded payload is cleared as soon as parsing succeeds,
 *   and all remaining blobs are cleared on terminal states / by the janitor.
 */
import { createHash } from "node:crypto";

import { parseIfcBytes } from "@/domain/ifcParser";
import { inputFingerprint } from "@/domain/pipelineArtifacts";
import { calculateComplianceMetrics } from "@/domain/complianceMetrics";
import type { NormalizedModel, Requirement, ValidationResult } from "@/domain/types";
import { validateUploadedModel } from "@/domain/uploadHelpers";
import { validateWithDeterministicRules } from "@/domain/validationPipeline";
import { logEvent, metricEvent } from "@/observability/logger";
import { PersistenceError } from "@/persistence/supabaseRest";
import { serviceSupabaseRequest } from "@/persistence/serviceSupabase";
import { withParserTimeout } from "@/security/uploadGuards";

export type JobStatus = "queued" | "processing" | "completed" | "failed" | "cancelled";
export type JobPhase = "queued" | "parsing" | "validating" | "persisting" | "completed";

const LEASE_MS = 90_000;
const RETRY_BASE_DELAY_MS = 15_000;

export const JOB_PROGRESS: Record<JobPhase, number> = {
  queued: 5,
  parsing: 40,
  validating: 70,
  persisting: 90,
  completed: 100
};

export interface ValidationJobRow {
  id: string;
  project_id: string;
  owner_id: string;
  created_by: string;
  status: JobStatus;
  phase: JobPhase;
  progress_percent: number;
  input_file_name: string;
  input_content_base64: string | null;
  input_content_hash: string;
  specification_package_id: string;
  working_state: {
    model?: NormalizedModel;
    diagnostics?: unknown;
    requirements?: Requirement[];
    results?: ValidationResult[];
    metrics?: unknown;
  } | null;
  attempts: number;
  max_attempts: number;
  timeout_seconds: number;
  cancel_requested: boolean;
  started_at: string | null;
}

const JOB_SELECT =
  "id,project_id,owner_id,created_by,status,phase,progress_percent,input_file_name,input_content_base64,input_content_hash,specification_package_id,working_state,attempts,max_attempts,timeout_seconds,cancel_requested,started_at";

/**
 * Retry only errors that are safe to retry: infrastructure hiccups where the
 * same input can plausibly succeed next time. Deterministic input problems
 * (bad IFC, invalid JSON, parser timeout, missing specification) will fail
 * identically on every attempt and are never retried.
 */
export function classifyJobError(error: unknown): { retryable: boolean; message: string } {
  if (error instanceof PersistenceError) {
    return {
      retryable: error.status === 429 || error.status >= 500,
      message: error.message
    };
  }
  const message = error instanceof Error ? error.message : "The job failed unexpectedly.";
  if (/fetch failed|network|ECONNRESET|ETIMEDOUT|socket/i.test(message)) {
    return { retryable: true, message: "A transient network error interrupted the job." };
  }
  return { retryable: false, message };
}

async function patchJob(
  jobId: string,
  patch: Record<string, unknown>,
  conditions = ""
): Promise<ValidationJobRow | null> {
  const rows = await serviceSupabaseRequest<ValidationJobRow[]>(
    `validation_jobs?id=eq.${encodeURIComponent(jobId)}${conditions}&select=${JOB_SELECT}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() })
    }
  );
  return rows[0] ?? null;
}

/** Atomically claims one due job. Returns null when another worker won the race. */
export async function claimDueJob(jobId?: string, now = Date.now()): Promise<ValidationJobRow | null> {
  const nowIso = new Date(now).toISOString();
  const filter = jobId ? `&id=eq.${encodeURIComponent(jobId)}` : "";
  const candidates = await serviceSupabaseRequest<ValidationJobRow[]>(
    `validation_jobs?or=(and(status.eq.queued,next_run_at.lte.${encodeURIComponent(nowIso)}),and(status.eq.processing,lease_expires_at.lt.${encodeURIComponent(nowIso)}))${filter}&select=${JOB_SELECT},next_run_at,lease_expires_at&order=next_run_at.asc&limit=3`
  );

  for (const candidate of candidates) {
    if (candidate.status === "processing") {
      // Expired lease: a previous worker crashed mid-phase. That attempt is
      // spent; recycle the job or dead-letter it when attempts are exhausted.
      const attempts = candidate.attempts + 1;
      if (attempts >= candidate.max_attempts) {
        await patchJob(candidate.id, {
          status: "failed",
          attempts,
          last_error: "The worker lease expired repeatedly; the job was moved to the dead-letter state.",
          error_retryable: true,
          dead_lettered_at: nowIso,
          finished_at: nowIso,
          input_content_base64: null,
          working_state: null,
          lease_expires_at: null
        }, `&status=eq.processing&lease_expires_at=lt.${encodeURIComponent(nowIso)}`);
        metricEvent("job_dead_lettered", { jobId: candidate.id, reason: "lease_expired" });
      } else {
        await patchJob(candidate.id, {
          status: "queued",
          attempts,
          next_run_at: nowIso,
          lease_expires_at: null,
          last_error: "The worker lease expired; the job was re-queued.",
          error_retryable: true
        }, `&status=eq.processing&lease_expires_at=lt.${encodeURIComponent(nowIso)}`);
      }
      continue;
    }

    const claimed = await patchJob(candidate.id, {
      status: "processing",
      lease_expires_at: new Date(now + LEASE_MS).toISOString(),
      ...(candidate.started_at ? {} : { started_at: nowIso })
    }, "&status=eq.queued");
    if (claimed) return claimed;
  }
  return null;
}

function terminalPatch(extra: Record<string, unknown>): Record<string, unknown> {
  return {
    finished_at: new Date().toISOString(),
    lease_expires_at: null,
    input_content_base64: null,
    working_state: null,
    ...extra
  };
}

async function loadSpecification(job: ValidationJobRow): Promise<{ id: string; requirements: Requirement[] }> {
  const rows = await serviceSupabaseRequest<Array<{ id: string; requirements: Requirement[] }>>(
    `specification_packages?id=eq.${encodeURIComponent(job.specification_package_id)}&project_id=eq.${encodeURIComponent(job.project_id)}&select=id,requirements&limit=1`
  );
  if (!rows[0]) throw new PersistenceError("The selected specification no longer exists in this project.", 404);
  return rows[0];
}

async function persistArtifacts(job: ValidationJobRow): Promise<{ modelAssetId: string; validationRunId: string }> {
  const state = job.working_state;
  if (!state?.model || !state.requirements || !state.results) {
    throw new PersistenceError("The job lost its intermediate state and cannot be persisted.", 500);
  }
  const fingerprint = inputFingerprint({
    fileName: job.input_file_name,
    contentHash: job.input_content_hash,
    contentType: "application/octet-stream"
  });

  // Idempotent persist: look up by the job-scoped idempotency key first so a
  // retried persist phase reuses rows instead of duplicating them.
  const modelKey = `job:${job.id}:model`;
  const existingModels = await serviceSupabaseRequest<Array<{ id: string }>>(
    `project_model_assets?project_id=eq.${encodeURIComponent(job.project_id)}&idempotency_key=eq.${encodeURIComponent(modelKey)}&select=id&limit=1`
  );
  let modelAssetId = existingModels[0]?.id;
  if (!modelAssetId) {
    const rows = await serviceSupabaseRequest<Array<{ id: string }>>("project_model_assets", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        project_id: job.project_id,
        owner_id: job.owner_id,
        created_by: job.created_by,
        source_file_name: job.input_file_name,
        source_content_hash: job.input_content_hash,
        input_fingerprint: fingerprint,
        idempotency_key: modelKey,
        normalized_model: state.model,
        diagnostics: state.diagnostics ?? null
      })
    });
    modelAssetId = rows[0].id;
  }

  const runKey = `job:${job.id}:run`;
  const existingRuns = await serviceSupabaseRequest<Array<{ id: string }>>(
    `validation_runs?project_id=eq.${encodeURIComponent(job.project_id)}&idempotency_key=eq.${encodeURIComponent(runKey)}&select=id&limit=1`
  );
  let validationRunId = existingRuns[0]?.id;
  if (!validationRunId) {
    const rows = await serviceSupabaseRequest<Array<{ id: string }>>("validation_runs", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        project_id: job.project_id,
        owner_id: job.owner_id,
        created_by: job.created_by,
        model_name: job.input_file_name,
        normalized_model: state.model,
        requirements: state.requirements,
        results: state.results,
        metrics: state.metrics,
        model_asset_id: modelAssetId,
        specification_package_id: job.specification_package_id,
        input_fingerprint: fingerprint,
        idempotency_key: runKey,
        status: "completed"
      })
    });
    validationRunId = rows[0].id;
  }
  return { modelAssetId, validationRunId };
}

/**
 * Executes exactly one phase of a claimed job, then either re-queues it for
 * the next tick or finishes it. Always short enough for a serverless request.
 */
export async function runJobStep(job: ValidationJobRow, now = Date.now()): Promise<JobStatus> {
  if (job.cancel_requested) {
    await patchJob(job.id, terminalPatch({ status: "cancelled" }));
    metricEvent("job_cancelled", { jobId: job.id, phase: job.phase });
    return "cancelled";
  }

  if (job.started_at && now - new Date(job.started_at).getTime() > job.timeout_seconds * 1000) {
    await patchJob(job.id, terminalPatch({
      status: "failed",
      last_error: `The job exceeded its ${job.timeout_seconds}s processing budget.`,
      error_retryable: false
    }));
    metricEvent("job_timed_out", { jobId: job.id, phase: job.phase });
    return "failed";
  }

  try {
    if (job.phase === "queued" || job.phase === "parsing") {
      if (!job.input_content_base64) {
        throw new PersistenceError("The uploaded file is no longer available for parsing. Enqueue the job again.", 410);
      }
      const bytes = Buffer.from(job.input_content_base64, "base64");
      const actualHash = createHash("sha256").update(bytes).digest("hex");
      if (actualHash !== job.input_content_hash) {
        throw new PersistenceError("The stored upload no longer matches its checksum.", 422);
      }
      let model: NormalizedModel;
      let diagnostics: unknown = null;
      if (job.input_file_name.toLowerCase().endsWith(".ifc")) {
        const parsed = await withParserTimeout(() => parseIfcBytes(new Uint8Array(bytes)), 30_000, "IFC parse");
        model = parsed.model;
        diagnostics = parsed.diagnostics;
      } else {
        let raw: unknown;
        try {
          raw = JSON.parse(bytes.toString("utf8"));
        } catch {
          throw new PersistenceError("The uploaded model JSON is not valid JSON.", 422);
        }
        const parsed = validateUploadedModel(raw);
        if (!parsed.success) throw new PersistenceError(parsed.error, 422);
        model = parsed.data;
      }
      // Parsing succeeded: the raw payload is no longer needed — clear it now.
      await patchJob(job.id, {
        phase: "validating",
        status: "queued",
        next_run_at: new Date(now).toISOString(),
        progress_percent: JOB_PROGRESS.parsing,
        working_state: { model, diagnostics },
        input_content_base64: null,
        lease_expires_at: null,
        last_error: null,
        error_retryable: null
      });
      metricEvent("job_phase_completed", { jobId: job.id, phase: "parsing" });
      return "queued";
    }

    if (job.phase === "validating") {
      if (!job.working_state?.model) {
        throw new PersistenceError("The job lost its parsed model state.", 500);
      }
      const specification = await loadSpecification(job);
      const validated = validateWithDeterministicRules(job.working_state.model, specification.requirements);
      const metrics = calculateComplianceMetrics(validated.requirements, validated.results);
      await patchJob(job.id, {
        phase: "persisting",
        status: "queued",
        next_run_at: new Date(now).toISOString(),
        progress_percent: JOB_PROGRESS.validating,
        working_state: {
          model: validated.model,
          diagnostics: job.working_state.diagnostics ?? null,
          requirements: validated.requirements,
          results: validated.results,
          metrics
        },
        lease_expires_at: null,
        last_error: null,
        error_retryable: null
      });
      metricEvent("job_phase_completed", { jobId: job.id, phase: "validating" });
      return "queued";
    }

    // persisting
    const { modelAssetId, validationRunId } = await persistArtifacts(job);
    await patchJob(job.id, terminalPatch({
      status: "completed",
      phase: "completed",
      progress_percent: JOB_PROGRESS.completed,
      model_asset_id: modelAssetId,
      validation_run_id: validationRunId,
      last_error: null,
      error_retryable: null
    }));
    metricEvent("job_completed", { jobId: job.id });
    return "completed";
  } catch (error) {
    const { retryable, message } = classifyJobError(error);
    const attempts = job.attempts + 1;
    if (retryable && attempts < job.max_attempts) {
      const delayMs = RETRY_BASE_DELAY_MS * 2 ** (attempts - 1);
      await patchJob(job.id, {
        status: "queued",
        attempts,
        next_run_at: new Date(now + delayMs).toISOString(),
        lease_expires_at: null,
        last_error: message,
        error_retryable: true
      });
      logEvent("warn", "job.retry_scheduled", { jobId: job.id, phase: job.phase, attempts, delayMs });
      return "queued";
    }
    await patchJob(job.id, terminalPatch({
      status: "failed",
      attempts,
      last_error: message,
      error_retryable: retryable,
      // Dead letter = a safe-to-retry failure that exhausted its attempts.
      ...(retryable ? { dead_lettered_at: new Date(now).toISOString() } : {}),
      // Keep the payload when parsing never succeeded so a manual retry can resume.
      input_content_base64: job.phase === "queued" || job.phase === "parsing" ? job.input_content_base64 : null,
      working_state: job.phase === "validating" || job.phase === "persisting" ? job.working_state : null
    }));
    metricEvent("job_failed", { jobId: job.id, phase: job.phase, retryable });
    return "failed";
  }
}

/** Worker tick: claim and advance up to `limit` due jobs, one phase each. */
export async function processDueJobs(limit = 5, now = Date.now()): Promise<number> {
  let processed = 0;
  for (let i = 0; i < Math.min(Math.max(limit, 1), 20); i += 1) {
    const job = await claimDueJob(undefined, now);
    if (!job) break;
    await runJobStep(job, now);
    processed += 1;
  }
  return processed;
}

/** Advances one specific job if it is due (used by status polling). */
export async function advanceJob(jobId: string, now = Date.now()): Promise<boolean> {
  const job = await claimDueJob(jobId, now);
  if (!job) return false;
  await runJobStep(job, now);
  return true;
}

/**
 * Janitor: clears temporary payloads and working state from terminal jobs.
 * Failed jobs keep their payload for `retentionHours` so a manual retry can
 * resume; afterwards the blobs are dropped and only metadata remains.
 */
export async function cleanupFinishedJobPayloads(retentionHours = 24, now = Date.now()): Promise<number> {
  const cutoff = new Date(now - retentionHours * 3_600_000).toISOString();
  const rows = await serviceSupabaseRequest<Array<{ id: string }>>(
    `validation_jobs?status=in.(failed,cancelled,completed)&finished_at=lt.${encodeURIComponent(cutoff)}&or=(input_content_base64.not.is.null,working_state.not.is.null)&select=id`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ input_content_base64: null, working_state: null, updated_at: new Date(now).toISOString() })
    }
  );
  if (rows.length > 0) metricEvent("job_payloads_cleaned", { count: rows.length });
  return rows.length;
}
