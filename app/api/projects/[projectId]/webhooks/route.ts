import { createProjectWebhookSchema } from "@/persistence/schemas";
import {
  authenticatedUserId,
  bearerToken,
  persistenceResponse,
  supabaseRequest
} from "@/persistence/supabaseRest";
import {
  assertSafeWebhookUrl,
  createWebhookSecret
} from "@/persistence/webhookDelivery";

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
  const rows = await supabaseRequest<Array<{ id: string; owner_id: string }>>(
    token,
    `projects?id=eq.${encodeURIComponent(projectId)}&select=id,owner_id&limit=1`
  );
  if (!rows[0]) return { ok: false, error: Response.json({ error: "Project not found." }, { status: 404 }) };
  if (rows[0].owner_id !== userId) {
    return { ok: false, error: Response.json({ error: "Only the project owner can manage webhooks." }, { status: 403 }) };
  }
  return { ok: true, project: rows[0] };
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
      `project_webhooks?project_id=eq.${encodeURIComponent(projectId)}&select=id,url,events,enabled,expires_at,revoked_at,created_at,updated_at&order=created_at.desc`
    );
    return Response.json({ webhooks: rows });
  } catch (error) {
    return persistenceResponse(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const token = bearerToken(request);
    const userId = await authenticatedUserId(token);
    const { projectId } = await context.params;
    const input = createProjectWebhookSchema.parse(await request.json());
    const ownership = await requireOwner(token, projectId, userId);
    if (!ownership.ok) return ownership.error;
    await assertSafeWebhookUrl(input.url);
    if (input.expiresAt && new Date(input.expiresAt).getTime() <= Date.now()) {
      return Response.json({ error: "Webhook expiry must be in the future." }, { status: 400 });
    }
    const secret = createWebhookSecret();
    const rows = await supabaseRequest<unknown[]>(token, "project_webhooks", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        project_id: projectId,
        owner_id: userId,
        created_by: userId,
        url: input.url,
        events: input.events,
        secret_hash: secret.hash,
        encrypted_secret: secret.encrypted,
        expires_at: input.expiresAt ?? null
      })
    });
    return Response.json({
      webhook: rows[0],
      secret: secret.secret,
      warning: "Copy this signing secret now; it will not be shown again."
    }, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError || (typeof error === "object" && error !== null && "issues" in error)) {
      return Response.json({ error: "Invalid webhook payload." }, { status: 400 });
    }
    return persistenceResponse(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const token = bearerToken(request);
    const userId = await authenticatedUserId(token);
    const { projectId } = await context.params;
    const webhookId = new URL(request.url).searchParams.get("webhookId");
    if (!webhookId || !/^[0-9a-f-]{36}$/i.test(webhookId)) {
      return Response.json({ error: "A valid webhookId is required." }, { status: 400 });
    }
    const ownership = await requireOwner(token, projectId, userId);
    if (!ownership.ok) return ownership.error;
    const rows = await supabaseRequest<unknown[]>(
      token,
      `project_webhooks?id=eq.${encodeURIComponent(webhookId)}&project_id=eq.${encodeURIComponent(projectId)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          enabled: false,
          revoked_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
      }
    );
    if (!rows[0]) return Response.json({ error: "Webhook not found." }, { status: 404 });
    return Response.json({ webhook: rows[0] });
  } catch (error) {
    return persistenceResponse(error);
  }
}
