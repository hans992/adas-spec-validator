import { projectInvitationSchema, projectMemberRoleSchema } from "@/persistence/schemas";
import { authenticatedUserId, bearerToken, persistenceResponse, supabaseRequest } from "@/persistence/supabaseRest";

export const runtime = "nodejs";
type Context = { params: Promise<{ projectId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const token = bearerToken(request); await authenticatedUserId(token);
    const { projectId } = await context.params; const id = encodeURIComponent(projectId);
    const [members, invitations] = await Promise.all([
      supabaseRequest<unknown[]>(token, `project_members?project_id=eq.${id}&select=user_id,role,created_at&order=created_at.asc`),
      supabaseRequest<unknown[]>(token, `project_invitations?project_id=eq.${id}&status=eq.pending&select=id,email,role,expires_at,created_at&order=created_at.desc`)
    ]);
    return Response.json({ members, invitations });
  } catch (error) { return persistenceResponse(error); }
}

export async function POST(request: Request, context: Context) {
  try {
    const token = bearerToken(request); const ownerId = await authenticatedUserId(token);
    const { projectId } = await context.params; const input = projectInvitationSchema.parse(await request.json());
    const rows = await supabaseRequest<unknown[]>(token, "project_invitations?on_conflict=project_id,email", {
      method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ project_id: projectId, owner_id: ownerId, email: input.email, role: input.role, status: "pending", expires_at: new Date(Date.now() + 7 * 86400000).toISOString() })
    });
    return Response.json({ invitation: rows[0] }, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError || (typeof error === "object" && error !== null && "issues" in error)) return Response.json({ error: "Invalid invitation payload." }, { status: 400 });
    return persistenceResponse(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const token = bearerToken(request); await authenticatedUserId(token); const { projectId } = await context.params;
    const input = projectMemberRoleSchema.parse(await request.json());
    const rows = await supabaseRequest<unknown[]>(token, `project_members?project_id=eq.${encodeURIComponent(projectId)}&user_id=eq.${encodeURIComponent(input.userId)}`, {
      method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ role: input.role })
    });
    return Response.json({ member: rows[0] });
  } catch (error) {
    if (error instanceof SyntaxError || (typeof error === "object" && error !== null && "issues" in error)) return Response.json({ error: "Invalid member payload." }, { status: 400 });
    return persistenceResponse(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const token = bearerToken(request); await authenticatedUserId(token); const { projectId } = await context.params;
    const userId = new URL(request.url).searchParams.get("userId");
    const parsed = projectMemberRoleSchema.shape.userId.safeParse(userId);
    if (!parsed.success) return Response.json({ error: "Invalid member identifier." }, { status: 400 });
    await supabaseRequest(token, `project_members?project_id=eq.${encodeURIComponent(projectId)}&user_id=eq.${encodeURIComponent(parsed.data)}`, { method: "DELETE" });
    return new Response(null, { status: 204 });
  } catch (error) { return persistenceResponse(error); }
}
