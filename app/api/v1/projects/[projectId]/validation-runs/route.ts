import { calculateComplianceMetrics } from "@/domain/complianceMetrics";
import { inputFingerprint } from "@/domain/pipelineArtifacts";
import { buildRegressionReport, normalizeReleasePolicy } from "@/domain/regressionValidation";
import type { NormalizedModel, Requirement } from "@/domain/types";
import { validateWithDeterministicRules } from "@/domain/validationPipeline";
import type { ValidationSnapshot } from "@/domain/validationComparison";
import {
  apiErrorResponse,
  apiResponse,
  readIdempotencyKey,
  requireProjectApiScope
} from "@/persistence/projectApiAuth";
import { createPipelineRunSchema } from "@/persistence/schemas";
import { PersistenceError } from "@/persistence/supabaseRest";
import { serviceSupabaseRequest } from "@/persistence/serviceSupabase";
import {
  dispatchWebhookDeliveries,
  enqueueValidationCompleted
} from "@/persistence/webhookDelivery";

export const runtime = "nodejs";
type Context = { params: Promise<{ projectId: string }> };

type ModelAsset = {
  id: string;
  source_file_name: string;
  normalized_model: NormalizedModel;
};
type SpecificationAsset = {
  id: string;
  name: string;
  revision: string;
  requirements: Requirement[];
};

export async function GET(request: Request, context: Context) {
  const requestId = crypto.randomUUID();
  try {
    const { projectId } = await context.params;
    await requireProjectApiScope(request, projectId, "runs:read");
    const rows = await serviceSupabaseRequest<unknown[]>(
      `validation_runs?project_id=eq.${encodeURIComponent(projectId)}&select=id,model_name,model_asset_id,specification_package_id,status,metrics,created_at&order=created_at.desc&limit=100`
    );
    return apiResponse({ items: rows, nextCursor: null }, { requestId });
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

export async function POST(request: Request, context: Context) {
  const requestId = crypto.randomUUID();
  try {
    const { projectId } = await context.params;
    const identity = await requireProjectApiScope(request, projectId, "runs:write");
    const idempotencyKey = readIdempotencyKey(request);
    const input = createPipelineRunSchema.parse(await request.json());
    const fingerprint = inputFingerprint(input);

    const existing = await serviceSupabaseRequest<Array<{
      id: string;
      input_fingerprint: string;
      model_name: string;
      status: string;
      metrics: Record<string, unknown>;
      created_at: string;
    }>>(
      `validation_runs?project_id=eq.${encodeURIComponent(projectId)}&idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&select=id,input_fingerprint,model_name,status,metrics,created_at&limit=1`
    );
    if (existing[0]) {
      if (existing[0].input_fingerprint !== fingerprint) {
        throw new PersistenceError("Idempotency-Key was already used with different validation input.", 409);
      }
      return apiResponse({ run: existing[0], replayed: true }, { requestId });
    }

    const [models, specifications, projects] = await Promise.all([
      serviceSupabaseRequest<ModelAsset[]>(
        `project_model_assets?id=eq.${encodeURIComponent(input.modelId)}&project_id=eq.${encodeURIComponent(projectId)}&select=id,source_file_name,normalized_model&limit=1`
      ),
      serviceSupabaseRequest<SpecificationAsset[]>(
        `specification_packages?id=eq.${encodeURIComponent(input.specificationId)}&project_id=eq.${encodeURIComponent(projectId)}&select=id,name,revision,requirements&limit=1`
      ),
      serviceSupabaseRequest<Array<{
        baseline_validation_id: string | null;
        release_policy: unknown;
      }>>(
        `projects?id=eq.${encodeURIComponent(projectId)}&select=baseline_validation_id,release_policy&limit=1`
      )
    ]);
    if (!models[0]) throw new PersistenceError("Model asset not found in this project.", 404);
    if (!specifications[0]) throw new PersistenceError("Specification asset not found in this project.", 404);

    const validated = validateWithDeterministicRules(
      models[0].normalized_model,
      specifications[0].requirements
    );
    const metrics = calculateComplianceMetrics(validated.requirements, validated.results);
    const rows = await serviceSupabaseRequest<ValidationSnapshot[]>("validation_runs", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        project_id: projectId,
        owner_id: identity.ownerId,
        created_by: identity.actorId,
        model_name: models[0].source_file_name,
        normalized_model: validated.model,
        requirements: validated.requirements,
        results: validated.results,
        metrics,
        model_asset_id: models[0].id,
        specification_package_id: specifications[0].id,
        input_fingerprint: fingerprint,
        idempotency_key: idempotencyKey,
        status: "completed"
      })
    });
    const run = rows[0];
    if (!run) throw new PersistenceError("Validation run could not be persisted.", 500);

    let regression = null;
    const baselineId = projects[0]?.baseline_validation_id;
    if (baselineId && baselineId !== run.id) {
      const baselineRows = await serviceSupabaseRequest<ValidationSnapshot[]>(
        `validation_runs?id=eq.${encodeURIComponent(baselineId)}&project_id=eq.${encodeURIComponent(projectId)}&select=id,model_name,normalized_model,requirements,results,created_at&limit=1`
      );
      if (baselineRows[0]) {
        regression = buildRegressionReport({
          baseline: baselineRows[0],
          candidate: run,
          policy: normalizeReleasePolicy(projects[0]?.release_policy)
        });
      }
    }

    let webhook: { queued: number; deliveryAttempted: boolean; error?: string } = {
      queued: 0,
      deliveryAttempted: false
    };
    try {
      const deliveryIds = await enqueueValidationCompleted({
        projectId,
        run,
        regression
      });
      webhook = { queued: deliveryIds.length, deliveryAttempted: deliveryIds.length > 0 };
      await dispatchWebhookDeliveries(deliveryIds);
    } catch (error) {
      webhook = {
        ...webhook,
        error: error instanceof Error ? error.message : "Webhook enqueue or delivery failed."
      };
    }

    return apiResponse(
      { run, regression, webhook, replayed: false },
      { status: 201, requestId }
    );
  } catch (error) {
    if (error instanceof SyntaxError || (typeof error === "object" && error !== null && "issues" in error)) {
      return apiErrorResponse(new PersistenceError("Invalid validation run payload.", 400), requestId);
    }
    return apiErrorResponse(error, requestId);
  }
}
