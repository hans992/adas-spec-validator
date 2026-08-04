import { authenticatedUserId, bearerToken, persistenceResponse, supabaseRequest } from "@/persistence/supabaseRest";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const token = bearerToken(request); await authenticatedUserId(token);
    const invitations = await supabaseRequest<unknown[]>(token, "project_invitations?status=eq.pending&expires_at=gt.now()&select=id,project_id,email,role,expires_at,projects(name)&order=created_at.desc");
    return Response.json({ invitations });
  } catch (error) { return persistenceResponse(error); }
}

export async function POST(request: Request) {
  try {
    const token = bearerToken(request); await authenticatedUserId(token);
    const body = await request.json() as { invitationId?: unknown };
    if (typeof body.invitationId !== "string") return Response.json({ error: "Invalid invitation payload." }, { status: 400 });
    const projectId = await supabaseRequest<string>(token, "rpc/accept_project_invitation", { method: "POST", body: JSON.stringify({ invitation_uuid: body.invitationId }) });
    return Response.json({ projectId });
  } catch (error) { return persistenceResponse(error); }
}
