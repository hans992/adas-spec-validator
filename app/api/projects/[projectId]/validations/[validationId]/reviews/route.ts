import { reviewDecisionSchema } from "@/persistence/schemas";
import { authenticatedUserId, bearerToken, persistenceResponse, supabaseRequest } from "@/persistence/supabaseRest";

export const runtime = "nodejs";

type Context = { params: Promise<{ projectId: string; validationId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const token = bearerToken(request);
    await authenticatedUserId(token);
    const { projectId, validationId } = await context.params;
    const reviews = await supabaseRequest<unknown[]>(token,
      `validation_reviews?project_id=eq.${encodeURIComponent(projectId)}&validation_run_id=eq.${encodeURIComponent(validationId)}&select=requirement_id,status,comment,updated_at&order=updated_at.desc`
    );
    return Response.json({ reviews });
  } catch (error) { return persistenceResponse(error); }
}

export async function PUT(request: Request, context: Context) {
  try {
    const token = bearerToken(request);
    const ownerId = await authenticatedUserId(token);
    const { projectId, validationId } = await context.params;
    const input = reviewDecisionSchema.parse(await request.json());
    const runs = await supabaseRequest<Array<{ requirements?: Array<{ id?: string }> }>>(token,
      `validation_runs?id=eq.${encodeURIComponent(validationId)}&project_id=eq.${encodeURIComponent(projectId)}&select=requirements&limit=1`
    );
    if (runs.length === 0) return Response.json({ error: "Validation not found." }, { status: 404 });
    if (!runs[0].requirements?.some((requirement) => requirement.id === input.requirementId)) {
      return Response.json({ error: "Requirement not found in this validation." }, { status: 400 });
    }
    const rows = await supabaseRequest<unknown[]>(token,
      "validation_reviews?on_conflict=validation_run_id,requirement_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({
          validation_run_id: validationId, project_id: projectId, owner_id: ownerId,
          requirement_id: input.requirementId, status: input.status, comment: input.comment,
          updated_at: new Date().toISOString()
        })
      }
    );
    return Response.json({ review: rows[0] });
  } catch (error) {
    if (error instanceof SyntaxError || (typeof error === "object" && error !== null && "issues" in error)) {
      return Response.json({ error: "Invalid review payload." }, { status: 400 });
    }
    return persistenceResponse(error);
  }
}
