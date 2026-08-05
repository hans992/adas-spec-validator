import {
  exportPipelineCsv,
  exportPipelineSarif,
  type PipelineReport
} from "@/domain/pipelineArtifacts";
import { apiErrorResponse, apiResponse, requireProjectApiScope } from "@/persistence/projectApiAuth";
import { PersistenceError } from "@/persistence/supabaseRest";
import { serviceSupabaseRequest } from "@/persistence/serviceSupabase";

export const runtime = "nodejs";
type Context = { params: Promise<{ projectId: string; runId: string }> };

export async function GET(request: Request, context: Context) {
  const requestId = crypto.randomUUID();
  try {
    const { projectId, runId } = await context.params;
    await requireProjectApiScope(request, projectId, "runs:read");
    const rows = await serviceSupabaseRequest<unknown[]>(
      `validation_runs?id=eq.${encodeURIComponent(runId)}&project_id=eq.${encodeURIComponent(projectId)}&select=id,project_id,model_name,model_asset_id,specification_package_id,status,normalized_model,requirements,results,metrics,created_at&limit=1`
    );
    if (!rows[0]) throw new PersistenceError("Validation run not found.", 404);
    const run = rows[0] as PipelineReport & Record<string, unknown>;
    const format = new URL(request.url).searchParams.get("format");
    const report: PipelineReport = {
      runId: String(run.id),
      projectId: String(run.project_id),
      modelName: String(run.model_name),
      status: String(run.status),
      metrics: (run.metrics ?? {}) as Record<string, unknown>,
      requirements: run.requirements,
      results: run.results
    };
    if (format === "csv") {
      return new Response(exportPipelineCsv(report), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="validation-${runId}.csv"`,
          "X-Request-Id": requestId
        }
      });
    }
    if (format === "sarif") {
      return new Response(JSON.stringify(exportPipelineSarif(report), null, 2), {
        headers: {
          "Content-Type": "application/sarif+json",
          "Content-Disposition": `attachment; filename="validation-${runId}.sarif"`,
          "X-Request-Id": requestId
        }
      });
    }
    return apiResponse({ run }, { requestId });
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}
