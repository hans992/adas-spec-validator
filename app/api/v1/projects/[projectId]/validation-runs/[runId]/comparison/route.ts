import {
  buildRegressionReport,
  normalizeReleasePolicy,
  type RegressionReview
} from "@/domain/regressionValidation";
import type { ValidationSnapshot } from "@/domain/validationComparison";
import { apiErrorResponse, apiResponse, requireProjectApiScope } from "@/persistence/projectApiAuth";
import { PersistenceError } from "@/persistence/supabaseRest";
import { serviceSupabaseRequest } from "@/persistence/serviceSupabase";

export const runtime = "nodejs";
type Context = { params: Promise<{ projectId: string; runId: string }> };

export async function GET(request: Request, context: Context) {
  const requestId = crypto.randomUUID();
  try {
    const { projectId, runId } = await context.params;
    await requireProjectApiScope(request, projectId, "regressions:read");
    const baselineAlias = new URL(request.url).searchParams.get("baseline") ?? "main";
    if (baselineAlias !== "main") {
      throw new PersistenceError("Only the configured 'main' project baseline is supported.", 400);
    }
    const projects = await serviceSupabaseRequest<Array<{
      baseline_validation_id: string | null;
      release_policy: unknown;
    }>>(
      `projects?id=eq.${encodeURIComponent(projectId)}&select=baseline_validation_id,release_policy&limit=1`
    );
    const baselineId = projects[0]?.baseline_validation_id;
    if (!baselineId) throw new PersistenceError("No baseline validation is configured.", 409);
    if (baselineId === runId) throw new PersistenceError("Candidate is the configured baseline.", 400);

    const [baselineRows, candidateRows, reviews] = await Promise.all([
      serviceSupabaseRequest<ValidationSnapshot[]>(
        `validation_runs?id=eq.${encodeURIComponent(baselineId)}&project_id=eq.${encodeURIComponent(projectId)}&select=id,model_name,normalized_model,requirements,results,created_at&limit=1`
      ),
      serviceSupabaseRequest<ValidationSnapshot[]>(
        `validation_runs?id=eq.${encodeURIComponent(runId)}&project_id=eq.${encodeURIComponent(projectId)}&select=id,model_name,normalized_model,requirements,results,created_at&limit=1`
      ),
      serviceSupabaseRequest<RegressionReview[]>(
        `validation_reviews?validation_run_id=eq.${encodeURIComponent(runId)}&project_id=eq.${encodeURIComponent(projectId)}&select=requirement_id,status,comment,updated_at`
      )
    ]);
    if (!baselineRows[0]) throw new PersistenceError("Baseline validation not found.", 404);
    if (!candidateRows[0]) throw new PersistenceError("Candidate validation not found.", 404);

    const report = buildRegressionReport({
      baseline: baselineRows[0],
      candidate: candidateRows[0],
      policy: normalizeReleasePolicy(projects[0]?.release_policy),
      reviews
    });
    return apiResponse({ comparison: report }, { requestId });
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}
