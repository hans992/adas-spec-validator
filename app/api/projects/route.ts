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
    await authenticatedUserId(token);
    const projects = await supabaseRequest<unknown[]>(
      token,
      "projects?select=id,name,description,created_at,updated_at&order=updated_at.desc"
    );
    return Response.json({ projects });
  } catch (error) {
    return persistenceResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const token = bearerToken(request);
    const ownerId = await authenticatedUserId(token);
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
