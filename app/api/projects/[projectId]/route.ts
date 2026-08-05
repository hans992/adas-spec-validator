import { createRequestLog } from "@/observability/logger";
import { recordAuditEvent } from "@/persistence/auditEvents";
import { updateProjectSettingsSchema } from "@/persistence/schemas";
import {
  authenticatedUserId,
  bearerToken,
  persistenceResponse,
  supabaseRequest
} from "@/persistence/supabaseRest";

export const runtime = "nodejs";

type Context = { params: Promise<{ projectId: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const token = bearerToken(request);
    const userId = await authenticatedUserId(token);
    const { projectId } = await context.params;
    const input = updateProjectSettingsSchema.parse(await request.json());

    const projects = await supabaseRequest<Array<{ id: string; owner_id: string }>>(
      token,
      `projects?id=eq.${encodeURIComponent(projectId)}&select=id,owner_id&limit=1`
    );
    if (!projects[0]) return Response.json({ error: "Project not found." }, { status: 404 });
    if (projects[0].owner_id !== userId) {
      return Response.json({ error: "Only the project owner can update baseline and release policy." }, { status: 403 });
    }

    if (input.baselineValidationId) {
      const runs = await supabaseRequest<Array<{ id: string }>>(
        token,
        `validation_runs?id=eq.${encodeURIComponent(input.baselineValidationId)}&project_id=eq.${encodeURIComponent(projectId)}&select=id&limit=1`
      );
      if (!runs[0]) {
        return Response.json({ error: "Baseline validation must belong to this project." }, { status: 400 });
      }
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.baselineValidationId !== undefined) patch.baseline_validation_id = input.baselineValidationId;
    if (input.releasePolicy !== undefined) patch.release_policy = input.releasePolicy;

    const rows = await supabaseRequest<unknown[]>(
      token,
      `projects?id=eq.${encodeURIComponent(projectId)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(patch)
      }
    );
    return Response.json({ project: rows[0] });
  } catch (error) {
    if (error instanceof SyntaxError || (typeof error === "object" && error !== null && "issues" in error)) {
      return Response.json({ error: "Invalid project settings payload." }, { status: 400 });
    }
    return persistenceResponse(error);
  }
}

/**
 * Project lifecycle:
 * - DELETE                     soft delete (members lose access instantly, owner can restore)
 * - DELETE ?action=restore     undo a soft delete
 * - DELETE ?action=permanent   irreversible removal of the project and every child row
 * All actions are owner-only; RLS additionally hides foreign projects entirely.
 */
export async function DELETE(request: Request, context: Context) {
  const log = createRequestLog("/api/projects/[projectId]#DELETE");
  try {
    const token = bearerToken(request);
    const userId = await authenticatedUserId(token);
    const { projectId } = await context.params;
    const action = new URL(request.url).searchParams.get("action") ?? "soft";
    if (!["soft", "restore", "permanent"].includes(action)) {
      return Response.json({ error: "action must be soft, restore, or permanent." }, { status: 400 });
    }

    const projects = await supabaseRequest<Array<{ id: string; owner_id: string; deleted_at: string | null }>>(
      token,
      `projects?id=eq.${encodeURIComponent(projectId)}&select=id,owner_id,deleted_at&limit=1`
    );
    if (!projects[0]) return Response.json({ error: "Project not found." }, { status: 404 });
    if (projects[0].owner_id !== userId) {
      await recordAuditEvent({
        event: "project.delete", actorId: userId, projectId, requestId: log.requestId, outcome: "denied"
      });
      return Response.json({ error: "Only the project owner can delete or restore a project." }, { status: 403 });
    }

    if (action === "permanent") {
      await supabaseRequest(token, `projects?id=eq.${encodeURIComponent(projectId)}`, { method: "DELETE" });
      await recordAuditEvent({
        event: "project.permanently_deleted", actorId: userId, projectId, requestId: log.requestId
      });
      log.finish({ status: 200, action });
      return Response.json({ deleted: true, permanent: true });
    }

    const rows = await supabaseRequest<Array<{ id: string; deleted_at: string | null }>>(
      token,
      `projects?id=eq.${encodeURIComponent(projectId)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(
          action === "restore"
            ? { deleted_at: null, updated_at: new Date().toISOString() }
            : { deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }
        )
      }
    );
    await recordAuditEvent({
      event: action === "restore" ? "project.restored" : "project.soft_deleted",
      actorId: userId, projectId, requestId: log.requestId
    });
    log.finish({ status: 200, action });
    return Response.json({ project: rows[0], deleted: action !== "restore", permanent: false });
  } catch (error) {
    log.fail(error);
    return persistenceResponse(error);
  }
}
