import { createHash } from "node:crypto";

import { createRequestLog, metricEvent } from "@/observability/logger";
import {
  authenticatedUserId,
  bearerToken,
  persistenceResponse,
  supabaseRequest
} from "@/persistence/supabaseRest";
import { consumeRateLimit, rateLimitedResponse } from "@/security/rateLimit";
import { assertUploadedFile, UPLOAD_POLICIES } from "@/security/uploadGuards";

export const runtime = "nodejs";

type Context = { params: Promise<{ projectId: string }> };

const JOB_LIST_SELECT =
  "id,kind,status,phase,progress_percent,input_file_name,specification_package_id,attempts,max_attempts,cancel_requested,last_error,error_retryable,dead_lettered_at,model_asset_id,validation_run_id,created_at,started_at,finished_at";

export async function GET(request: Request, context: Context) {
  try {
    const token = bearerToken(request);
    await authenticatedUserId(token);
    const { projectId } = await context.params;
    const jobs = await supabaseRequest<unknown[]>(token,
      `validation_jobs?project_id=eq.${encodeURIComponent(projectId)}&select=${JOB_LIST_SELECT}&order=created_at.desc&limit=50`
    );
    return Response.json({ jobs });
  } catch (error) {
    return persistenceResponse(error);
  }
}

/**
 * Enqueues a background import-and-validate job. The upload is validated and
 * stored immediately; parsing and validation run in short worker steps driven
 * by status polling and the internal runner, never inside this request.
 */
export async function POST(request: Request, context: Context) {
  const log = createRequestLog("/api/projects/[projectId]/jobs");
  try {
    const token = bearerToken(request);
    const userId = await authenticatedUserId(token);
    const { projectId } = await context.params;

    const rateLimit = await consumeRateLimit("upload", `jobs:${projectId}`);
    if (!rateLimit.allowed) {
      return rateLimitedResponse(rateLimit, "Too many job submissions for this project. Please retry later.");
    }

    const form = await request.formData();
    const file = form.get("file");
    const specificationId = String(form.get("specificationId") ?? "");
    if (!(file instanceof File)) return Response.json({ error: "A model file is required." }, { status: 400 });
    if (!/^[0-9a-f-]{36}$/i.test(specificationId)) {
      return Response.json({ error: "A specificationId from this project is required." }, { status: 400 });
    }
    const maxBytes = Math.max(UPLOAD_POLICIES.ifc.maxBytes, UPLOAD_POLICIES.model_json.maxBytes);
    if (file.size === 0 || file.size > maxBytes) {
      return Response.json({ error: "Model must be non-empty and no larger than 20 MB." }, { status: 413 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = file.name.toLowerCase().endsWith(".json") ? "model_json" as const : "ifc" as const;
    const guard = assertUploadedFile({ kind, fileName: file.name, mimeType: file.type, bytes });
    if (!guard.ok) {
      metricEvent("upload_rejected", { requestId: log.requestId, kind, status: guard.status });
      return Response.json({ error: guard.error }, { status: guard.status });
    }

    // Visibility and ownership resolve through the caller's JWT (RLS).
    const [projects, specifications] = await Promise.all([
      supabaseRequest<Array<{ id: string; owner_id: string }>>(token,
        `projects?id=eq.${encodeURIComponent(projectId)}&select=id,owner_id&limit=1`
      ),
      supabaseRequest<Array<{ id: string }>>(token,
        `specification_packages?id=eq.${encodeURIComponent(specificationId)}&project_id=eq.${encodeURIComponent(projectId)}&select=id&limit=1`
      )
    ]);
    if (!projects[0]) return Response.json({ error: "Project not found." }, { status: 404 });
    if (!specifications[0]) {
      return Response.json({ error: "Specification not found in this project." }, { status: 400 });
    }

    const idempotencyKey = request.headers.get("idempotency-key")?.trim().slice(0, 200) || crypto.randomUUID();
    const existing = await supabaseRequest<Array<Record<string, unknown>>>(token,
      `validation_jobs?project_id=eq.${encodeURIComponent(projectId)}&idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&select=${JOB_LIST_SELECT}&limit=1`
    );
    if (existing[0]) {
      log.finish({ status: 200, replayed: true });
      return Response.json({ job: existing[0], replayed: true });
    }

    const rows = await supabaseRequest<Array<Record<string, unknown>>>(token, "validation_jobs", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        project_id: projectId,
        owner_id: projects[0].owner_id,
        created_by: userId,
        idempotency_key: idempotencyKey,
        input_file_name: guard.safeFileName,
        input_content_base64: Buffer.from(bytes).toString("base64"),
        input_content_hash: createHash("sha256").update(bytes).digest("hex"),
        input_size_bytes: bytes.byteLength,
        specification_package_id: specificationId
      })
    });
    const job = rows[0] as Record<string, unknown>;
    metricEvent("job_enqueued", {
      requestId: log.requestId,
      jobId: job.id,
      projectId,
      sizeBytes: bytes.byteLength
    });
    log.finish({ status: 201 });
    const { input_content_base64: _omit, working_state: _omit2, ...safeJob } = job;
    return Response.json({ job: safeJob, replayed: false }, { status: 201 });
  } catch (error) {
    log.fail(error);
    return persistenceResponse(error);
  }
}
