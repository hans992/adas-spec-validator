import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createProjectApiToken,
  readIdempotencyKey,
  requireProjectApiScope,
  sha256Hex
} from "@/persistence/projectApiAuth";

describe("project API authentication", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("creates opaque prefixed tokens and stores only a SHA-256 hash", () => {
    const token = createProjectApiToken();
    expect(token.token).toMatch(/^aec_[A-Za-z0-9_-]+$/);
    expect(token.hash).toBe(sha256Hex(token.token));
    expect(token.hash).toHaveLength(64);
    expect(token.hash).not.toContain(token.token);
  });

  it("authorizes the expected project and scope", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json([{
      token_id: "token-1",
      project_id: "project-1",
      owner_id: "owner-1",
      created_by: "user-1",
      scopes: ["models:write", "runs:read"]
    }]));
    const identity = await requireProjectApiScope(
      new Request("http://localhost", { headers: { authorization: "Bearer aec_secret" } }),
      "project-1",
      "models:write"
    );
    expect(identity.projectId).toBe("project-1");
    expect(identity.scopes).toContain("models:write");
    expect(JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body))).toEqual({
      input_hash: sha256Hex("aec_secret")
    });
  });

  it("denies missing scope and cross-project use", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json([{
        token_id: "token-1",
        project_id: "project-1",
        owner_id: "owner-1",
        created_by: "user-1",
        scopes: ["runs:read"]
      }]))
      .mockResolvedValueOnce(Response.json([{
        token_id: "token-1",
        project_id: "project-1",
        owner_id: "owner-1",
        created_by: "user-1",
        scopes: ["models:write"]
      }]));
    const request = () => new Request("http://localhost", {
      headers: { authorization: "Bearer aec_secret" }
    });
    await expect(requireProjectApiScope(request(), "project-1", "models:write"))
      .rejects.toMatchObject({ status: 403 });
    await expect(requireProjectApiScope(request(), "project-2", "models:write"))
      .rejects.toMatchObject({ status: 403 });
  });

  it("treats an empty token lookup as expired or revoked", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json([]));
    await expect(requireProjectApiScope(
      new Request("http://localhost", { headers: { authorization: "Bearer aec_revoked" } }),
      "project-1",
      "runs:read"
    )).rejects.toMatchObject({ status: 401 });
  });

  it("requires a bounded URL-safe idempotency key", () => {
    expect(readIdempotencyKey(new Request("http://localhost", {
      headers: { "Idempotency-Key": "commit:abc-123" }
    }))).toBe("commit:abc-123");
    expect(() => readIdempotencyKey(new Request("http://localhost")))
      .toThrow("Idempotency-Key");
    expect(() => readIdempotencyKey(new Request("http://localhost", {
      headers: { "Idempotency-Key": "not allowed" }
    }))).toThrow("Idempotency-Key");
  });
});
