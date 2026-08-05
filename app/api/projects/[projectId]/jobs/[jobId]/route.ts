import { z } from "zod";

import { advanceJob } from "@/jobs/validationJobs";
import { createRequestLog } from "@/observability/logger";
import { recordAuditEvent } from "@/persistence/auditEvents";
import { serviceSupabaseRequest } from "@/persistence/serviceSupabase";
import {
  authenticatedUserId,
  bearerToken,
  persistenceResponse,
  supabaseRequest
} from "@/persistence/supabaseRest";

export const runtime = "nodejs";

type Context = { params: Promise<{ projectId: string; jobId: string }> };

const JOB_SELECT =
  "id,kind,status,phase,progress_percent,input_file_name,input_content_base64,specification_package_id,attempts,max_attempts,cancel_requested,last_error,error_retryable,dead_lettered_at,model_asset_id,validation_run_id,next_run_at,lease_expires_at,created_by,created_at,started_at,finished_at";

type JobRow = {
  id: string;
  status: "queued" | "processing" | "completed" | "failed" | "cancelled";
  phase: string;
  input_content_base64: string | null;
  next_run_at: string;
  lease_expires_at: string | null;
  created_by: string;
} & Record<string, unknown>;

async function readJob(token: string, projectId: string, jobId: string): Promise<JobRow | null> {
  const rows = await supabaseRequest<JobRow[]>(token,
    `validation_jobs?id=eq.${encodeURIComponent(jobId)}&project_id=eq.${encodeURIComponent(projectId)}&select=${JOB_SELECT}&limit=1`
  );
  return rows[0] ?? null;
}

function publicJob(job: JobRow): Record<string, unknown> {
  const { input_content_base64, ...rest } = job;
  return { ...rest, has_payload: Boolean(input_content_base64) };
}

function jobIsDue(job: JobRow, now: number): boolean {
  if (job.status === "queued") return new Date(job.next_run_at).getTime() <= now;
  if (job.status === "processing") {
    return Boolean(job.lease_expires_at) && new Date(job.lease_expires_at as string).getTime() < now;
  }
  return false;
}

/**
 * Job status for polling. When the job is due, the poll itself drives one
 * worker step, so progress continues from browser polling alone — no external
 * scheduler is required for interactive use, and the job survives page
 * refreshes because all state lives in the database.
 */
export async function GET(request: Request, context: Context) {
  try {
    const token = bearerToken(request);
    await authenticatedUserId(token);
    const { projectId, jobId } = await context.params;
    let job = await readJob(token, projectId, jobId);
    if (!job) return Response.json({ error: "Job not found." }, { status: 404 });

    const advance = new URL(request.url).searchParams.get("advance") !== "0";
    if (advance && jobIsDue(job, Date.now())) {
      try {
        await advanceJob(jobId);
        job = await readJob(token, projectId, jobId) ?? job;
      } catch {
        // Worker problems surface through job state; polling must keep working.
      }
    }
    return Response.json({ job: publicJob(job) });
  } catch (error) {
    return persistenceResponse(error);
  }
}

const actionSchema = z.object({ action: z.enum(["cancel", "retry"]) }).strict();

/** Cancel or retry a job. Allowed for the job creator or the project owner. */
export async function POST(request: Request, context: Context) {
  const log = createRequestLog("/api/projects/[projectId]/jobs/[jobId]");
  try {
    const token = bearerToken(request);
    const userId = await authenticatedUserId(token);
    const { projectId, jobId } = await context.params;
    const { action } = actionSchema.parse(await request.json());

    const job = await readJob(token, projectId, jobId);
    if (!job) return Response.json({ error: "Job not found." }, { status: 404 });

    const projects = await supabaseRequest<Array<{ owner_id: string }>>(token,
      `projects?id=eq.${encodeURIComponent(projectId)}&select=owner_id&limit=1`
    );
    if (job.created_by !== userId && projects[0]?.owner_id !== userId) {
      return Response.json({ error: "Only the job creator or the project owner can manage this job." }, { status: 403 });
    }

    if (action === "cancel") {
      if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
        return Response.json({ error: `A ${job.status} job cannot be cancelled.` }, { status: 409 });
      }
      if (job.status === "queued") {
        await serviceSupabaseRequest(`validation_jobs?id=eq.${encodeURIComponent(jobId)}&status=eq.queued`, {
          method: "PATCH",
          body: JSON.stringify({
            status: "cancelled",
            cancel_requested: true,
            finished_at: new Date().toISOString(),
            input_content_base64: null,
            working_state: null,
            lease_expires_at: null,
            updated_at: new Date().toISOString()
          })
        });
      } else {
        // Processing: the runner honors the flag before its next phase.
        await serviceSupabaseRequest(`validation_jobs?id=eq.${encodeURIComponent(jobId)}`, {
          method: "PATCH",
          body: JSON.stringify({ cancel_requested: true, updated_at: new Date().toISOString() })
        });
      }
      await recordAuditEvent({ event: "job.cancelled", actorId: userId, projectId, targetId: jobId, requestId: log.requestId });
    } else {
      if (job.status !== "failed") {
        return Response.json({ error: "Only failed jobs can be retried." }, { status: 409 });
      }
      const needsPayload = job.phase === "queued" || job.phase === "parsing";
      if (needsPayload && !job.input_content_base64) {
        return Response.json({
          error: "The uploaded file has been cleaned up. Enqueue the job again with the file."
        }, { status: 409 });
      }
      await serviceSupabaseRequest(`validation_jobs?id=eq.${encodeURIComponent(jobId)}&status=eq.failed`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "queued",
          attempts: 0,
          next_run_at: new Date().toISOString(),
          cancel_requested: false,
          last_error: null,
          error_retryable: null,
          dead_lettered_at: null,
          finished_at: null,
          started_at: null,
          lease_expires_at: null,
          updated_at: new Date().toISOString()
        })
      });
      await recordAuditEvent({ event: "job.retried", actorId: userId, projectId, targetId: jobId, requestId: log.requestId });
    }

    const updated = await readJob(token, projectId, jobId);
    log.finish({ status: 200, action });
    return Response.json({ job: updated ? publicJob(updated) : null });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof z.ZodError) {
      return Response.json({ error: "action must be cancel or retry." }, { status: 400 });
    }
    log.fail(error);
    return persistenceResponse(error);
  }
}
