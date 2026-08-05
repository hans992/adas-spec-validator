import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  assertSafeWebhookUrl,
  createWebhookSecret,
  decryptWebhookSecret,
  dispatchWebhookDelivery,
  signWebhookBody,
  verifyWebhookSignature
} from "@/persistence/webhookDelivery";

describe("webhook security and delivery", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.example.com");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
    vi.stubEnv("WEBHOOK_ENCRYPTION_KEY", "test-only-encryption-key");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("encrypts webhook secrets and verifies HMAC signatures", () => {
    const generated = createWebhookSecret();
    expect(generated.secret).toMatch(/^whsec_/);
    expect(generated.encrypted).not.toContain(generated.secret);
    expect(decryptWebhookSecret(generated.encrypted)).toBe(generated.secret);
    const signature = signWebhookBody('{"ok":true}', generated.secret);
    expect(verifyWebhookSignature('{"ok":true}', signature, generated.secret)).toBe(true);
    expect(verifyWebhookSignature('{"ok":false}', signature, generated.secret)).toBe(false);
  });

  it("rejects non-HTTPS and private-network webhook targets", async () => {
    await expect(assertSafeWebhookUrl("http://example.com/hook")).rejects.toMatchObject({ status: 400 });
    await expect(assertSafeWebhookUrl("https://127.0.0.1/hook")).rejects.toMatchObject({ status: 400 });
    await expect(assertSafeWebhookUrl("https://192.168.1.10/hook")).rejects.toMatchObject({ status: 400 });
  });

  it("signs and records successful delivery", async () => {
    const secret = createWebhookSecret();
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json([{
        id: "webhook-1",
        project_id: "project-1",
        url: "https://203.0.113.10/hook",
        encrypted_secret: secret.encrypted,
        events: ["validation.completed"],
        enabled: true,
        expires_at: null,
        revoked_at: null
      }]))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(Response.json([]));

    await dispatchWebhookDelivery({
      id: "delivery-1",
      webhook_id: "webhook-1",
      project_id: "project-1",
      event_id: "event-1",
      event_type: "validation.completed",
      payload: { id: "event-1", ok: true },
      attempts: 0
    });

    const receiverCall = fetchMock.mock.calls[1]!;
    expect(receiverCall[0]).toBe("https://203.0.113.10/hook");
    expect(new Headers((receiverCall[1] as RequestInit).headers).get("X-AEC-Signature"))
      .toMatch(/^sha256=[a-f0-9]{64}$/);
    const patch = JSON.parse(String((fetchMock.mock.calls[2]![1] as RequestInit).body));
    expect(patch).toMatchObject({ status: "delivered", attempts: 1, response_status: 204 });
  });

  it("keeps failed delivery pending with exponential retry metadata", async () => {
    const secret = createWebhookSecret();
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json([{
        id: "webhook-1",
        project_id: "project-1",
        url: "https://203.0.113.11/hook",
        encrypted_secret: secret.encrypted,
        events: ["validation.completed"],
        enabled: true,
        expires_at: null,
        revoked_at: null
      }]))
      .mockResolvedValueOnce(new Response("temporary", { status: 503 }))
      .mockResolvedValueOnce(Response.json([]));

    await dispatchWebhookDelivery({
      id: "delivery-1",
      webhook_id: "webhook-1",
      project_id: "project-1",
      event_id: "event-1",
      event_type: "validation.completed",
      payload: { id: "event-1" },
      attempts: 0
    });
    const patch = JSON.parse(String((fetchMock.mock.calls[2]![1] as RequestInit).body));
    expect(patch.status).toBe("pending");
    expect(patch.attempts).toBe(1);
    expect(patch.next_retry_at).toBeTruthy();
    expect(patch.last_error).toContain("503");
  });
});
