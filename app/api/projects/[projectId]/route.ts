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
