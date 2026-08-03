import { bearerToken, persistenceResponse, supabaseRequest } from "@/persistence/supabaseRest";

export const runtime = "nodejs";

type Context = { params: Promise<{ projectId: string; validationId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const token = bearerToken(request);
    const { projectId, validationId } = await context.params;
    const rows = await supabaseRequest<unknown[]>(
      token,
      `validation_runs?id=eq.${encodeURIComponent(validationId)}&project_id=eq.${encodeURIComponent(projectId)}&select=id,project_id,model_name,normalized_model,requirements,results,metrics,created_at&limit=1`
    );
    if (rows.length === 0) return Response.json({ error: "Validation not found." }, { status: 404 });
    return Response.json({ validation: rows[0] });
  } catch (error) {
    return persistenceResponse(error);
  }
}
