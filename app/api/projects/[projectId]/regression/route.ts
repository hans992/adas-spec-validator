import {
  buildRegressionReport,
  normalizeReleasePolicy,
  type RegressionReview
} from "@/domain/regressionValidation";
import type { ValidationSnapshot } from "@/domain/validationComparison";
import {
  authenticatedUserId,
  bearerToken,
  persistenceResponse,
  supabaseRequest
} from "@/persistence/supabaseRest";

export const runtime = "nodejs";

type Context = { params: Promise<{ projectId: string }> };

/**
 * GET /api/projects/:projectId/regression?candidateId=
 * Compares the candidate run against the project's baseline using the stored
 * release policy. Purely deterministic — no AI involvement.
 */
export async function GET(request: Request, context: Context) {
  try {
    const token = bearerToken(request);
    await authenticatedUserId(token);
    const { projectId } = await context.params;
    const candidateId = new URL(request.url).searchParams.get("candidateId");
    if (!candidateId) {
      return Response.json({ error: "candidateId query parameter is required." }, { status: 400 });
    }

    const projects = await supabaseRequest<Array<{
      id: string;
      baseline_validation_id: string | null;
      release_policy: unknown;
    }>>(
      token,
      `projects?id=eq.${encodeURIComponent(projectId)}&select=id,baseline_validation_id,release_policy&limit=1`
    );
    if (!projects[0]) return Response.json({ error: "Project not found." }, { status: 404 });
    if (!projects[0].baseline_validation_id) {
      return Response.json({ error: "No baseline validation is set for this project." }, { status: 409 });
    }
    if (projects[0].baseline_validation_id === candidateId) {
      return Response.json({ error: "Candidate cannot be the same run as the baseline." }, { status: 400 });
    }

    const [baselineRows, candidateRows, reviewRows] = await Promise.all([
      supabaseRequest<ValidationSnapshot[]>(
        token,
        `validation_runs?id=eq.${encodeURIComponent(projects[0].baseline_validation_id)}&project_id=eq.${encodeURIComponent(projectId)}&select=id,model_name,normalized_model,requirements,results,created_at&limit=1`
      ),
      supabaseRequest<ValidationSnapshot[]>(
        token,
        `validation_runs?id=eq.${encodeURIComponent(candidateId)}&project_id=eq.${encodeURIComponent(projectId)}&select=id,model_name,normalized_model,requirements,results,created_at&limit=1`
      ),
      supabaseRequest<RegressionReview[]>(
        token,
        `validation_reviews?validation_run_id=eq.${encodeURIComponent(candidateId)}&project_id=eq.${encodeURIComponent(projectId)}&select=requirement_id,status,comment,updated_at`
      )
    ]);

    if (!baselineRows[0]) return Response.json({ error: "Baseline validation not found." }, { status: 404 });
    if (!candidateRows[0]) return Response.json({ error: "Candidate validation not found." }, { status: 404 });

    const report = buildRegressionReport({
      baseline: baselineRows[0],
      candidate: candidateRows[0],
      policy: normalizeReleasePolicy(projects[0].release_policy),
      reviews: reviewRows
    });

    return Response.json({ report });
  } catch (error) {
    return persistenceResponse(error);
  }
}
