import { createRequestLog } from "@/observability/logger";
import { recordAuditEvent } from "@/persistence/auditEvents";
import {
  authenticatedUserId,
  bearerToken,
  persistenceResponse,
  supabaseRequest
} from "@/persistence/supabaseRest";

export const runtime = "nodejs";

/**
 * GDPR-style account export. Returns every project the user owns with its
 * specifications, validation runs, reviews, and evidence metadata as one JSON
 * document. Queries run with the caller's JWT so RLS guarantees the export can
 * never contain another user's data. Binary evidence attachments are referenced
 * by SHA-256 hash instead of inlined to keep the export bounded.
 */
export async function GET(request: Request) {
  const log = createRequestLog("/api/account/export");
  try {
    const token = bearerToken(request);
    const userId = await authenticatedUserId(token);

    const [ownedProjects, memberships] = await Promise.all([
      supabaseRequest<Array<{ id: string }> & unknown[]>(token,
        `projects?owner_id=eq.${encodeURIComponent(userId)}&select=id,name,description,baseline_validation_id,release_policy,created_at,updated_at,deleted_at&order=created_at.asc`
      ),
      supabaseRequest<unknown[]>(token,
        `project_members?user_id=eq.${encodeURIComponent(userId)}&select=project_id,role,created_at`
      )
    ]);

    const projectIds = (ownedProjects as Array<{ id: string }>).map((project) => project.id);
    const inFilter = `in.(${projectIds.map((id) => `"${id}"`).join(",")})`;

    const [specifications, runs, reviews, evidence] = projectIds.length === 0
      ? [[], [], [], []]
      : await Promise.all([
          supabaseRequest<unknown[]>(token,
            `specification_packages?project_id=${inFilter}&select=id,project_id,name,revision,requirements,created_at&order=created_at.asc`
          ),
          supabaseRequest<unknown[]>(token,
            `validation_runs?project_id=${inFilter}&select=id,project_id,model_name,requirements,results,metrics,created_at&order=created_at.asc`
          ),
          supabaseRequest<unknown[]>(token,
            `validation_reviews?project_id=${inFilter}&select=id,project_id,validation_run_id,requirement_id,status,comment,waiver_reason,waiver_expires_at,updated_at&order=updated_at.asc`
          ),
          supabaseRequest<unknown[]>(token,
            `finding_evidence?project_id=${inFilter}&select=id,project_id,validation_run_id,requirement_id,kind,title,comment,link_url,technical_note,file_name,file_size_bytes,file_content_hash,created_at&order=created_at.asc`
          )
        ]);

    await recordAuditEvent({ event: "account.exported", actorId: userId, requestId: log.requestId });
    log.finish({ status: 200, projects: projectIds.length });
    return new Response(JSON.stringify({
      exportedAt: new Date().toISOString(),
      userId,
      ownedProjects,
      memberships,
      specifications,
      validationRuns: runs,
      reviews,
      evidence,
      note: "Binary evidence attachments are referenced by SHA-256 hash; download them per validation run through the audit bundle endpoint."
    }, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="aec-account-export-${userId}.json"`,
        "X-Request-Id": log.requestId
      }
    });
  } catch (error) {
    log.fail(error);
    return persistenceResponse(error);
  }
}
