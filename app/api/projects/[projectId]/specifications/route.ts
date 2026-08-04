import { saveSpecificationPackageSchema } from "@/persistence/schemas";
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
    const packages = await supabaseRequest<unknown[]>(
      token,
      `specification_packages?project_id=eq.${encodeURIComponent(projectId)}&select=id,project_id,name,revision,requirements,created_by,created_at&order=created_at.desc`
    );
    return Response.json({ specifications: packages });
  } catch (error) {
    return persistenceResponse(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const token = bearerToken(request);
    const actorId = await authenticatedUserId(token);
    const { projectId } = await context.params;
    const input = saveSpecificationPackageSchema.parse(await request.json());
    const projects = await supabaseRequest<Array<{ owner_id: string }>>(
      token,
      `projects?id=eq.${encodeURIComponent(projectId)}&select=owner_id&limit=1`
    );
    if (!projects[0]) return Response.json({ error: "Project not found." }, { status: 404 });

    const rows = await supabaseRequest<unknown[]>(token, "specification_packages", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        project_id: projectId,
        owner_id: projects[0].owner_id,
        created_by: actorId,
        ...input
      })
    });
    return Response.json({ specification: rows[0] }, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError || (typeof error === "object" && error !== null && "issues" in error)) {
      return Response.json({ error: "Invalid specification package." }, { status: 400 });
    }
    return persistenceResponse(error);
  }
}
