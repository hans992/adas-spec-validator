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
    const userId = await authenticatedUserId(token);
    const { projectId } = await context.params;
    const projects = await supabaseRequest<Array<{ owner_id: string }>>(
      token,
      `projects?id=eq.${encodeURIComponent(projectId)}&select=owner_id&limit=1`
    );
    if (!projects[0]) return Response.json({ error: "Project not found." }, { status: 404 });
    if (projects[0].owner_id !== userId) {
      return Response.json({ error: "Only the project owner can inspect webhook deliveries." }, { status: 403 });
    }
    const rows = await supabaseRequest<unknown[]>(
      token,
      `webhook_deliveries?project_id=eq.${encodeURIComponent(projectId)}&select=id,webhook_id,event_id,event_type,status,attempts,next_retry_at,last_attempt_at,delivered_at,response_status,last_error,created_at&order=created_at.desc&limit=100`
    );
    return Response.json({ deliveries: rows });
  } catch (error) {
    return persistenceResponse(error);
  }
}
