import { calculateComplianceMetrics } from "@/domain/complianceMetrics";
import { validateWithDeterministicRules } from "@/domain/validationPipeline";
import { saveValidationSchema } from "@/persistence/schemas";
import {
  authenticatedUserId,
  bearerToken,
  persistenceResponse,
  supabaseRequest
} from "@/persistence/supabaseRest";

export const runtime = "nodejs";

type Context = { params: Promise<{ projectId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const token = bearerToken(request);
    await authenticatedUserId(token);
    const { projectId } = await context.params;
    const encodedProjectId = encodeURIComponent(projectId);
    const validations = await supabaseRequest<unknown[]>(
      token,
      `validation_runs?project_id=eq.${encodedProjectId}&select=id,project_id,model_name,metrics,created_at&order=created_at.desc`
    );
    return Response.json({ validations });
  } catch (error) {
    return persistenceResponse(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const token = bearerToken(request);
    const actorId = await authenticatedUserId(token);
    const { projectId } = await context.params;
    const input = saveValidationSchema.parse(await request.json());
    const projects = await supabaseRequest<Array<{ owner_id: string }>>(token,
      `projects?id=eq.${encodeURIComponent(projectId)}&select=owner_id&limit=1`
    );
    if (!projects[0]) return Response.json({ error: "Project not found." }, { status: 404 });
    const { model, requirements, results } = validateWithDeterministicRules(input.model, input.requirements);
    const metrics = calculateComplianceMetrics(requirements, results);

    const rows = await supabaseRequest<unknown[]>(token, "validation_runs", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        project_id: projectId,
        owner_id: projects[0].owner_id,
        created_by: actorId,
        model_name: input.modelName,
        normalized_model: model,
        requirements,
        results,
        metrics
      })
    });
    return Response.json({ validation: rows[0] }, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError || (typeof error === "object" && error !== null && "issues" in error)) {
      return Response.json({ error: "Invalid validation payload." }, { status: 400 });
    }
    return persistenceResponse(error);
  }
}
