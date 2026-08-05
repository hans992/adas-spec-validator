import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual
} from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { stableJson } from "@/domain/pipelineArtifacts";
import { PersistenceError } from "@/persistence/supabaseRest";
import { serviceSupabaseRequest } from "@/persistence/serviceSupabase";

type WebhookRow = {
  id: string;
  project_id: string;
  url: string;
  encrypted_secret: string;
  events: string[];
  enabled: boolean;
  expires_at: string | null;
  revoked_at: string | null;
};

type DeliveryRow = {
  id: string;
  webhook_id: string;
  project_id: string;
  event_id: string;
  event_type: string;
  payload: unknown;
  attempts: number;
};

function encryptionKey(): Buffer {
  const configured = process.env.WEBHOOK_ENCRYPTION_KEY;
  if (!configured) throw new PersistenceError("Webhook encryption is not configured.", 503);
  return createHash("sha256").update(configured).digest();
}

export function createWebhookSecret(): {
  secret: string;
  hash: string;
  encrypted: string;
} {
  const secret = `whsec_${randomBytes(32).toString("base64url")}`;
  return {
    secret,
    hash: createHash("sha256").update(secret).digest("hex"),
    encrypted: encryptWebhookSecret(secret)
  };
}

export function encryptWebhookSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url")
  ].join(".");
}

export function decryptWebhookSecret(value: string): string {
  const [version, iv, tag, encrypted] = value.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) {
    throw new PersistenceError("Stored webhook secret is invalid.", 500);
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

export function signWebhookBody(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

export function verifyWebhookSignature(body: string, signature: string, secret: string): boolean {
  const expected = signWebhookBody(body, secret);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function privateIp(address: string): boolean {
  if (address === "::1" || address === "::" || address.startsWith("fc") || address.startsWith("fd") || address.startsWith("fe80:")) {
    return true;
  }
  const parts = address.split(".").map(Number);
  if (parts.length !== 4) return false;
  return parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 0);
}

export async function assertSafeWebhookUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new PersistenceError("Webhook URL is invalid.", 400);
  }
  if (url.protocol !== "https:") {
    throw new PersistenceError("Webhook URL must use HTTPS.", 400);
  }
  if (url.username || url.password || url.port) {
    throw new PersistenceError("Webhook URL cannot contain credentials or a custom port.", 400);
  }
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new PersistenceError("Webhook URL cannot target a private host.", 400);
  }
  const addresses = isIP(host)
    ? [{ address: host }]
    : await lookup(host, { all: true }).catch(() => {
        throw new PersistenceError("Webhook hostname could not be resolved.", 400);
      });
  if (addresses.some((entry) => privateIp(entry.address))) {
    throw new PersistenceError("Webhook URL cannot target a private network.", 400);
  }
}

export async function enqueueValidationCompleted(input: {
  projectId: string;
  run: { id: string; model_name: string; metrics?: unknown };
  regression?: unknown;
}): Promise<string[]> {
  const webhooks = await serviceSupabaseRequest<WebhookRow[]>(
    `project_webhooks?project_id=eq.${encodeURIComponent(input.projectId)}&enabled=eq.true&revoked_at=is.null&select=id,project_id,url,encrypted_secret,events,enabled,expires_at,revoked_at`
  );
  const eligible = webhooks.filter((webhook) =>
    webhook.events.includes("validation.completed") &&
    (!webhook.expires_at || new Date(webhook.expires_at).getTime() > Date.now())
  );
  if (eligible.length === 0) return [];
  const eventId = crypto.randomUUID();
  const payload = {
    id: eventId,
    type: "validation.completed",
    createdAt: new Date().toISOString(),
    projectId: input.projectId,
    data: {
      runId: input.run.id,
      modelName: input.run.model_name,
      metrics: input.run.metrics ?? null,
      regression: input.regression ?? null
    }
  };
  const rows = await serviceSupabaseRequest<Array<{ id: string }>>("webhook_deliveries", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(eligible.map((webhook) => ({
      webhook_id: webhook.id,
      project_id: input.projectId,
      event_id: eventId,
      event_type: "validation.completed",
      payload
    })))
  });
  return rows.map((row) => row.id);
}

async function patchDelivery(id: string, patch: Record<string, unknown>): Promise<void> {
  await serviceSupabaseRequest(
    `webhook_deliveries?id=eq.${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify(patch) }
  );
}

export async function dispatchWebhookDelivery(delivery: DeliveryRow): Promise<void> {
  const webhooks = await serviceSupabaseRequest<WebhookRow[]>(
    `project_webhooks?id=eq.${encodeURIComponent(delivery.webhook_id)}&project_id=eq.${encodeURIComponent(delivery.project_id)}&select=id,project_id,url,encrypted_secret,events,enabled,expires_at,revoked_at&limit=1`
  );
  const webhook = webhooks[0];
  const attempt = delivery.attempts + 1;
  if (!webhook || !webhook.enabled || webhook.revoked_at ||
      (webhook.expires_at && new Date(webhook.expires_at).getTime() <= Date.now())) {
    await patchDelivery(delivery.id, {
      status: "failed",
      attempts: attempt,
      last_attempt_at: new Date().toISOString(),
      last_error: "Webhook is disabled, expired, revoked, or missing."
    });
    return;
  }

  try {
    await assertSafeWebhookUrl(webhook.url);
    const body = stableJson(delivery.payload);
    const response = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "AEC-Spec-Validator-Webhook/1.0",
        "X-AEC-Event": delivery.event_type,
        "X-AEC-Event-Id": delivery.event_id,
        "X-AEC-Signature": signWebhookBody(body, decryptWebhookSecret(webhook.encrypted_secret))
      },
      body,
      redirect: "error",
      signal: AbortSignal.timeout(10_000)
    });
    const responseBody = (await response.text()).slice(0, 2000);
    if (!response.ok) throw new Error(`Receiver returned HTTP ${response.status}: ${responseBody}`);
    await patchDelivery(delivery.id, {
      status: "delivered",
      attempts: attempt,
      last_attempt_at: new Date().toISOString(),
      delivered_at: new Date().toISOString(),
      response_status: response.status,
      response_body: responseBody,
      last_error: null
    });
  } catch (error) {
    const final = attempt >= 8;
    const delaySeconds = Math.min(3600, 30 * (2 ** (attempt - 1)));
    await patchDelivery(delivery.id, {
      status: final ? "failed" : "pending",
      attempts: attempt,
      last_attempt_at: new Date().toISOString(),
      next_retry_at: new Date(Date.now() + delaySeconds * 1000).toISOString(),
      last_error: error instanceof Error ? error.message.slice(0, 2000) : "Webhook delivery failed."
    });
  }
}

export async function dispatchPendingWebhookDeliveries(limit = 20): Promise<number> {
  const rows = await serviceSupabaseRequest<DeliveryRow[]>(
    `webhook_deliveries?status=eq.pending&next_retry_at=lte.${encodeURIComponent(new Date().toISOString())}&select=id,webhook_id,project_id,event_id,event_type,payload,attempts&order=next_retry_at.asc&limit=${Math.min(Math.max(limit, 1), 100)}`
  );
  for (const row of rows) await dispatchWebhookDelivery(row);
  return rows.length;
}

export async function dispatchWebhookDeliveries(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const rows = await serviceSupabaseRequest<DeliveryRow[]>(
    `webhook_deliveries?id=in.(${ids.map(encodeURIComponent).join(",")})&select=id,webhook_id,project_id,event_id,event_type,payload,attempts`
  );
  for (const row of rows) await dispatchWebhookDelivery(row);
}
