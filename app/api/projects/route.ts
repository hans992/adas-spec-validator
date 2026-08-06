import { assertCanCreateProject, ensureAccountPlan } from "@/billing/planLimits";
import { createProjectSchema } from "@/persistence/schemas";
import {
  authenticatedUserId,
  bearerToken,
  persistenceResponse,
  supabaseRequest
} from "@/persistence/supabaseRest";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const token = bearerToken(request);
    const userId = await authenticatedUserId(token);
    const projects = await supabaseRequest<Array<{ id: string; owner_id: string } & Record<string, unknown>>>(
      token,
      // Soft-deleted projects are excluded from the working list; owners restore
      // them through the lifecycle endpoint before they reappear.
      "projects?select=id,owner_id,name,description,baseline_validation_id,release_policy,created_at,updated_at&deleted_at=is.null&order=updated_at.desc"
    );
    const memberships = await supabaseRequest<Array<{ project_id: string; role: "viewer" | "editor" }>>(
      token, `project_members?user_id=eq.${encodeURIComponent(userId)}&select=project_id,role`
    );
    const roles = new Map(memberships.map((membership) => [membership.project_id, membership.role]));
    return Response.json({ projects: projects.map((project) => ({ ...project, access_role: project.owner_id === userId ? "owner" : roles.get(project.id) })) });
  } catch (error) {
    return persistenceResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const token = bearerToken(request);
    const ownerId = await authenticatedUserId(token);
    await ensureAccountPlan(ownerId);
    await assertCanCreateProject(token, ownerId);
    const input = createProjectSchema.parse(await request.json());
    const projects = await supabaseRequest<unknown[]>(token, "projects", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ owner_id: ownerId, ...input })
    });
    return Response.json({ project: projects[0] }, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError || (typeof error === "object" && error !== null && "issues" in error)) {
      return Response.json({ error: "Invalid project payload." }, { status: 400 });
    }
    return persistenceResponse(error);
  }
}
