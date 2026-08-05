import {
  buildAuditBundle,
  normalizeFindingEvidence,
  normalizeReviewDecision
} from "@/domain/auditPackage";
import type { ValidationSnapshot } from "@/domain/validationComparison";
import { authenticatedUserId, bearerToken, persistenceResponse, supabaseRequest } from "@/persistence/supabaseRest";

export const runtime = "nodejs";

type Context = { params: Promise<{ projectId: string; validationId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const token = bearerToken(request);
    const actorId = await authenticatedUserId(token);
    const { projectId, validationId } = await context.params;

    const [projects, runs, reviews, history, evidence] = await Promise.all([
      supabaseRequest<Array<{
        id: string;
        name: string;
        description?: string;
        baseline_validation_id?: string | null;
        release_policy?: unknown;
      }>>(token, `projects?id=eq.${encodeURIComponent(projectId)}&select=id,name,description,baseline_validation_id,release_policy&limit=1`),
      supabaseRequest<Array<ValidationSnapshot & {
        model_asset_id?: string | null;
        specification_package_id?: string | null;
        input_fingerprint?: string | null;
      }>>(token,
        `validation_runs?id=eq.${encodeURIComponent(validationId)}&project_id=eq.${encodeURIComponent(projectId)}&select=id,model_name,normalized_model,requirements,results,metrics,model_asset_id,specification_package_id,input_fingerprint,created_at&limit=1`
      ),
      supabaseRequest<Array<Record<string, unknown>>>(token,
        `validation_reviews?project_id=eq.${encodeURIComponent(projectId)}&validation_run_id=eq.${encodeURIComponent(validationId)}&select=id,decision_id,requirement_id,status,comment,waiver_reason,waiver_expires_at,updated_by,updated_at`
      ),
      supabaseRequest<Array<Record<string, unknown>>>(token,
        `validation_review_history?project_id=eq.${encodeURIComponent(projectId)}&validation_run_id=eq.${encodeURIComponent(validationId)}&select=id,decision_id,requirement_id,status,comment,waiver_reason,waiver_expires_at,reviewer_id,decided_at,superseded_at,superseded_by_decision_id`
      ),
      supabaseRequest<Array<Record<string, unknown>>>(token,
        `finding_evidence?project_id=eq.${encodeURIComponent(projectId)}&validation_run_id=eq.${encodeURIComponent(validationId)}&select=id,requirement_id,rule_id,finding_key,kind,title,comment,link_url,technical_note,model_element_id,model_element_type,file_name,file_mime,file_size_bytes,file_content_hash,file_content_base64,created_by,created_at`
      )
    ]);

    if (!projects[0]) return Response.json({ error: "Project not found." }, { status: 404 });
    if (!runs[0]) return Response.json({ error: "Validation not found." }, { status: 404 });

    let specification;
    let modelFingerprint;
    if (runs[0].specification_package_id) {
      const specs = await supabaseRequest<Array<{
        id: string;
        name: string;
        revision: string;
        document_source?: unknown;
      }>>(token,
        `specification_packages?id=eq.${encodeURIComponent(runs[0].specification_package_id)}&project_id=eq.${encodeURIComponent(projectId)}&select=id,name,revision,document_source&limit=1`
      );
      if (specs[0]) {
        specification = {
          id: specs[0].id,
          name: specs[0].name,
          revision: specs[0].revision,
          ...(specs[0].document_source
            ? { documentSource: specs[0].document_source as never }
            : {})
        };
      }
    }
    if (runs[0].model_asset_id) {
      const models = await supabaseRequest<Array<{
        id: string;
        source_file_name: string;
        source_content_hash: string;
        input_fingerprint: string;
      }>>(token,
        `project_model_assets?id=eq.${encodeURIComponent(runs[0].model_asset_id)}&project_id=eq.${encodeURIComponent(projectId)}&select=id,source_file_name,source_content_hash,input_fingerprint&limit=1`
      );
      if (models[0]) {
        modelFingerprint = {
          modelAssetId: models[0].id,
          sourceFileName: models[0].source_file_name,
          sourceContentHash: models[0].source_content_hash,
          inputFingerprint: models[0].input_fingerprint
        };
      }
    }

    const { zip, manifest } = await buildAuditBundle({
      project: {
        id: projects[0].id,
        name: projects[0].name,
        description: projects[0].description,
        baselineValidationId: projects[0].baseline_validation_id,
        releasePolicy: projects[0].release_policy
      },
      snapshot: runs[0],
      specification,
      modelFingerprint: modelFingerprint ?? {
        sourceFileName: runs[0].model_name,
        ...(runs[0].input_fingerprint ? { inputFingerprint: runs[0].input_fingerprint } : {})
      },
      reviews: reviews.map((row) => normalizeReviewDecision(row as never)),
      reviewHistory: history.map((row) => normalizeReviewDecision(row as never)),
      evidence: evidence.map((row) => normalizeFindingEvidence(row as never)),
      generatedBy: actorId
    });

    return new Response(Buffer.from(zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="audit-bundle-${validationId}.zip"`,
        "X-AEC-Package-Sha256": manifest.packageSha256,
        "X-AEC-Integrity": "sha256-manifest"
      }
    });
  } catch (error) {
    return persistenceResponse(error);
  }
}
