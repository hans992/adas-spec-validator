import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DELETE, POST } from "./route";

const headers = { authorization: "Bearer user-jwt", "content-type": "application/json" };
const context = { params: Promise.resolve({ projectId: "project-1" }) };

describe("project API token lifecycle", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("returns plaintext once while persisting only its hash", async () => {
    vi.stubEnv("FORCE_ACCOUNT_PLAN", "professional");
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id: "user-1" }))
      .mockResolvedValueOnce(Response.json([{ id: "project-1", owner_id: "user-1" }]))
      .mockResolvedValueOnce(Response.json([{
        id: "token-id",
        name: "CI",
        token_prefix: "aec_example",
        scopes: ["runs:read"]
      }]));
    const response = await POST(new Request("http://localhost/api/projects/project-1/tokens", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "CI", scopes: ["runs:read"] })
    }), context);
    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.token).toMatch(/^aec_/);
    const stored = JSON.parse(String((fetchMock.mock.calls[2]![1] as RequestInit).body));
    expect(stored.token_hash).toHaveLength(64);
    expect(stored.token_hash).not.toContain(payload.token);
    expect(stored).not.toHaveProperty("token");
  });

  it("blocks token creation on the starter plan", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id: "user-1" }))
      .mockResolvedValueOnce(Response.json([])); // starter
    const response = await POST(new Request("http://localhost/api/projects/project-1/tokens", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "CI", scopes: ["runs:read"] })
    }), context);
    expect(response.status).toBe(402);
  });

  it("rejects expiry in the past", async () => {
    vi.stubEnv("FORCE_ACCOUNT_PLAN", "professional");
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id: "user-1" }))
      .mockResolvedValueOnce(Response.json([{ id: "project-1", owner_id: "user-1" }]));
    const response = await POST(new Request("http://localhost/api/projects/project-1/tokens", {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "Expired",
        scopes: ["runs:read"],
        expiresAt: "2020-01-01T00:00:00.000Z"
      })
    }), context);
    expect(response.status).toBe(400);
  });

  it("revokes a token rather than deleting its audit record", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id: "user-1" }))
      .mockResolvedValueOnce(Response.json([{ id: "project-1", owner_id: "user-1" }]))
      .mockResolvedValueOnce(Response.json([{ id: "11111111-1111-1111-1111-111111111111" }]));
    const response = await DELETE(new Request(
      "http://localhost/api/projects/project-1/tokens?tokenId=11111111-1111-1111-1111-111111111111",
      { method: "DELETE", headers }
    ), context);
    expect(response.status).toBe(200);
    const patch = JSON.parse(String((fetchMock.mock.calls[2]![1] as RequestInit).body));
    expect(patch.revoked_at).toBeTruthy();
  });
});
