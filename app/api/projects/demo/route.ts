import {
  DEMO_PROJECT_DESCRIPTION,
  DEMO_PROJECT_NAME,
  DEMO_WAIVE_REQUIREMENT_ID,
  buildDemoValidation,
  demoSpecificationA,
  demoSpecificationB
} from "@/domain/demoProject";
import { assertCanCreateProject, ensureAccountPlan } from "@/billing/planLimits";
import { createRequestLog, metricEvent } from "@/observability/logger";
import {
  authenticatedUserId,
  bearerToken,
  persistenceResponse,
  supabaseRequest
} from "@/persistence/supabaseRest";

export const runtime = "nodejs";

/**
 * Creates a complete demo project for the signed-in user:
 * project → two specification revisions → baseline + candidate validation runs
 * → one waived finding on the baseline. Idempotent per user: if a demo project
 * already exists, it is returned instead of duplicating.
 */
export async function POST(request: Request) {
  const log = createRequestLog("/api/projects/demo");
  try {
    const token = bearerToken(request);
    const userId = await authenticatedUserId(token);
    await ensureAccountPlan(userId);

    const existing = await supabaseRequest<Array<{ id: string; name: string; owner_id: string }>>(token,
      `projects?owner_id=eq.${encodeURIComponent(userId)}&name=eq.${encodeURIComponent(DEMO_PROJECT_NAME)}&deleted_at=is.null&select=id,name,owner_id&limit=1`
    );
    if (existing[0]) {
      log.finish({ status: 200, replayed: true });
      return Response.json({ project: { ...existing[0], access_role: "owner" }, replayed: true });
    }

    await assertCanCreateProject(token, userId);

    const projects = await supabaseRequest<Array<{ id: string; name: string; owner_id: string }>>(token, "projects", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        owner_id: userId,
        name: DEMO_PROJECT_NAME,
        description: DEMO_PROJECT_DESCRIPTION
      })
    });
    const project = projects[0];
    if (!project) throw new Error("Demo project could not be created.");

    const [specARows, specBRows] = await Promise.all([
      supabaseRequest<Array<{ id: string }>>(token, "specification_packages", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          project_id: project.id,
          owner_id: userId,
          created_by: userId,
          name: demoSpecificationA.name,
          revision: demoSpecificationA.revision,
          requirements: demoSpecificationA.requirements
        })
      }),
      supabaseRequest<Array<{ id: string }>>(token, "specification_packages", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          project_id: project.id,
          owner_id: userId,
          created_by: userId,
          name: demoSpecificationB.name,
          revision: demoSpecificationB.revision,
          requirements: demoSpecificationB.requirements
        })
      })
    ]);

    const baseline = buildDemoValidation(demoSpecificationA.requirements);
    const candidate = buildDemoValidation(demoSpecificationB.requirements);

    const baselineRows = await supabaseRequest<Array<{ id: string }>>(token, "validation_runs", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        project_id: project.id,
        owner_id: userId,
        created_by: userId,
        model_name: "riverside-office.ifc",
        normalized_model: baseline.model,
        requirements: baseline.requirements,
        results: baseline.results,
        metrics: baseline.metrics,
        specification_package_id: specARows[0]?.id ?? null,
        status: "completed"
      })
    });
    const baselineId = baselineRows[0]?.id;

    const candidateRows = await supabaseRequest<Array<{ id: string }>>(token, "validation_runs", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        project_id: project.id,
        owner_id: userId,
        created_by: userId,
        model_name: "riverside-office.ifc",
        normalized_model: candidate.model,
        requirements: candidate.requirements,
        results: candidate.results,
        metrics: candidate.metrics,
        specification_package_id: specBRows[0]?.id ?? null,
        status: "completed"
      })
    });

    if (baselineId) {
      await supabaseRequest(token, `projects?id=eq.${encodeURIComponent(project.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ baseline_validation_id: baselineId })
      });

      const decisionId = crypto.randomUUID();
      await supabaseRequest(token, "validation_reviews", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          validation_run_id: baselineId,
          project_id: project.id,
          owner_id: userId,
          decision_id: decisionId,
          requirement_id: DEMO_WAIVE_REQUIREMENT_ID,
          status: "waived",
          comment: "Accepted temporary stockroom egress door until Phase 2 door package.",
          waiver_reason: "Site logistics require the existing 780 mm egress leaf until the contractor replaces it in Phase 2.",
          waiver_expires_at: new Date(Date.now() + 90 * 86_400_000).toISOString(),
          updated_by: userId
        })
      });
    }

    metricEvent("demo_project_created", {
      requestId: log.requestId,
      projectId: project.id,
      baselineId,
      candidateId: candidateRows[0]?.id
    });
    log.finish({ status: 201 });
    return Response.json({
      project: { ...project, access_role: "owner", baseline_validation_id: baselineId },
      baselineValidationId: baselineId,
      candidateValidationId: candidateRows[0]?.id ?? null,
      specificationIds: { revisionA: specARows[0]?.id ?? null, revisionB: specBRows[0]?.id ?? null },
      replayed: false
    }, { status: 201 });
  } catch (error) {
    log.fail(error);
    return persistenceResponse(error);
  }
}
