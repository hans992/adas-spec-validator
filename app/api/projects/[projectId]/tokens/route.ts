import { assertCanUseApi } from "@/billing/planLimits";
import { createProjectApiToken, PROJECT_API_SCOPES } from "@/persistence/projectApiAuth";
import { createProjectApiTokenSchema } from "@/persistence/schemas";
import {
  authenticatedUserId,
  bearerToken,
  persistenceResponse,
  supabaseRequest
} from "@/persistence/supabaseRest";

export const runtime = "nodejs";
type Context = { params: Promise<{ projectId: string }> };

async function requireOwner(
  token: string,
  projectId: string,
  userId: string
): Promise<
  { ok: false; error: Response } |
  { ok: true; project: { id: string; owner_id: string } }
> {
  const projects = await supabaseRequest<Array<{ id: string; owner_id: string }>>(
    token,
    `projects?id=eq.${encodeURIComponent(projectId)}&select=id,owner_id&limit=1`
  );
  if (!projects[0]) return { ok: false, error: Response.json({ error: "Project not found." }, { status: 404 }) };
  if (projects[0].owner_id !== userId) {
    return { ok: false, error: Response.json({ error: "Only the project owner can manage API tokens." }, { status: 403 }) };
  }
  return { ok: true, project: projects[0] };
}

export async function GET(request: Request, context: Context) {
  try {
    const token = bearerToken(request);
    const userId = await authenticatedUserId(token);
    const { projectId } = await context.params;
    const ownership = await requireOwner(token, projectId, userId);
    if (!ownership.ok) return ownership.error;
    const rows = await supabaseRequest<unknown[]>(
      token,
      `project_api_tokens?project_id=eq.${encodeURIComponent(projectId)}&select=id,name,token_prefix,scopes,expires_at,revoked_at,last_used_at,created_at&order=created_at.desc`
    );
    return Response.json({ tokens: rows, availableScopes: PROJECT_API_SCOPES });
  } catch (error) {
    return persistenceResponse(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const sessionToken = bearerToken(request);
    const userId = await authenticatedUserId(sessionToken);
    const { projectId } = await context.params;
    await assertCanUseApi(sessionToken, userId);
    const input = createProjectApiTokenSchema.parse(await request.json());
    const ownership = await requireOwner(sessionToken, projectId, userId);
    if (!ownership.ok) return ownership.error;
    if (input.expiresAt && new Date(input.expiresAt).getTime() <= Date.now()) {
      return Response.json({ error: "Token expiry must be in the future." }, { status: 400 });
    }
    const secret = createProjectApiToken();
    const rows = await supabaseRequest<unknown[]>(sessionToken, "project_api_tokens", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        project_id: projectId,
        owner_id: userId,
        created_by: userId,
        name: input.name,
        token_hash: secret.hash,
        token_prefix: secret.prefix,
        scopes: [...new Set(input.scopes)],
        expires_at: input.expiresAt ?? null
      })
    });
    return Response.json(
      { token: secret.token, apiToken: rows[0], warning: "Copy this token now; it will not be shown again." },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof SyntaxError || (typeof error === "object" && error !== null && "issues" in error)) {
      return Response.json({ error: "Invalid API token payload." }, { status: 400 });
    }
    return persistenceResponse(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const sessionToken = bearerToken(request);
    const userId = await authenticatedUserId(sessionToken);
    const { projectId } = await context.params;
    const tokenId = new URL(request.url).searchParams.get("tokenId");
    if (!tokenId || !/^[0-9a-f-]{36}$/i.test(tokenId)) {
      return Response.json({ error: "A valid tokenId is required." }, { status: 400 });
    }
    const ownership = await requireOwner(sessionToken, projectId, userId);
    if (!ownership.ok) return ownership.error;
    const rows = await supabaseRequest<unknown[]>(
      sessionToken,
      `project_api_tokens?id=eq.${encodeURIComponent(tokenId)}&project_id=eq.${encodeURIComponent(projectId)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ revoked_at: new Date().toISOString() })
      }
    );
    if (!rows[0]) return Response.json({ error: "API token not found." }, { status: 404 });
    return Response.json({ apiToken: rows[0] });
  } catch (error) {
    return persistenceResponse(error);
  }
}
