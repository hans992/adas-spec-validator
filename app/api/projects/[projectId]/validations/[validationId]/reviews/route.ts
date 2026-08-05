import { reviewDecisionSchema } from "@/persistence/schemas";
import { authenticatedUserId, bearerToken, persistenceResponse, supabaseRequest } from "@/persistence/supabaseRest";

export const runtime = "nodejs";

type Context = { params: Promise<{ projectId: string; validationId: string }> };

type CurrentReview = {
  id: string;
  decision_id: string;
  requirement_id: string;
  status: "open" | "acknowledged" | "resolved" | "waived";
  comment: string;
  waiver_reason: string | null;
  waiver_expires_at: string | null;
  updated_by: string | null;
  updated_at: string;
};

export async function GET(request: Request, context: Context) {
  try {
    const token = bearerToken(request);
    await authenticatedUserId(token);
    const { projectId, validationId } = await context.params;
    const includeHistory = new URL(request.url).searchParams.get("history") === "1";
    const [reviews, history] = await Promise.all([
      supabaseRequest<unknown[]>(token,
        `validation_reviews?project_id=eq.${encodeURIComponent(projectId)}&validation_run_id=eq.${encodeURIComponent(validationId)}&select=id,decision_id,requirement_id,status,comment,waiver_reason,waiver_expires_at,updated_by,updated_at&order=updated_at.desc`
      ),
      includeHistory
        ? supabaseRequest<unknown[]>(token,
            `validation_review_history?project_id=eq.${encodeURIComponent(projectId)}&validation_run_id=eq.${encodeURIComponent(validationId)}&select=id,decision_id,requirement_id,status,comment,waiver_reason,waiver_expires_at,reviewer_id,decided_at,superseded_at,superseded_by_decision_id&order=decided_at.desc`
          )
        : Promise.resolve([])
    ]);
    return Response.json({ reviews, history });
  } catch (error) {
    return persistenceResponse(error);
  }
}

export async function PUT(request: Request, context: Context) {
  try {
    const token = bearerToken(request);
    const actorId = await authenticatedUserId(token);
    const { projectId, validationId } = await context.params;
    const input = reviewDecisionSchema.parse(await request.json());
    const runs = await supabaseRequest<Array<{ owner_id: string; requirements?: Array<{ id?: string }> }>>(token,
      `validation_runs?id=eq.${encodeURIComponent(validationId)}&project_id=eq.${encodeURIComponent(projectId)}&select=owner_id,requirements&limit=1`
    );
    if (runs.length === 0) return Response.json({ error: "Validation not found." }, { status: 404 });
    if (!runs[0].requirements?.some((requirement) => requirement.id === input.requirementId)) {
      return Response.json({ error: "Requirement not found in this validation." }, { status: 400 });
    }

    const existing = await supabaseRequest<CurrentReview[]>(token,
      `validation_reviews?project_id=eq.${encodeURIComponent(projectId)}&validation_run_id=eq.${encodeURIComponent(validationId)}&requirement_id=eq.${encodeURIComponent(input.requirementId)}&select=id,decision_id,requirement_id,status,comment,waiver_reason,waiver_expires_at,updated_by,updated_at&limit=1`
    );
    const nextDecisionId = crypto.randomUUID();
    const decidedAt = new Date().toISOString();

    if (existing[0]) {
      await supabaseRequest(token, "validation_review_history", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          validation_run_id: validationId,
          project_id: projectId,
          owner_id: runs[0].owner_id,
          requirement_id: existing[0].requirement_id,
          decision_id: existing[0].decision_id,
          status: existing[0].status,
          comment: existing[0].comment,
          waiver_reason: existing[0].waiver_reason,
          waiver_expires_at: existing[0].waiver_expires_at,
          reviewer_id: existing[0].updated_by ?? actorId,
          decided_at: existing[0].updated_at,
          superseded_at: decidedAt,
          superseded_by_decision_id: nextDecisionId
        })
      });
    }

    const rows = await supabaseRequest<unknown[]>(token,
      "validation_reviews?on_conflict=validation_run_id,requirement_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({
          validation_run_id: validationId,
          project_id: projectId,
          owner_id: runs[0].owner_id,
          updated_by: actorId,
          requirement_id: input.requirementId,
          status: input.status,
          comment: input.comment,
          waiver_reason: input.status === "waived" ? input.waiverReason ?? null : null,
          waiver_expires_at: input.status === "waived" ? input.waiverExpiresAt ?? null : null,
          decision_id: nextDecisionId,
          updated_at: decidedAt
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
