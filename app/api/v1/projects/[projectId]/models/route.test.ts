import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { inputFingerprint } from "@/domain/pipelineArtifacts";
import { sha256Hex } from "@/persistence/projectApiAuth";

import { POST } from "./route";

const context = { params: Promise.resolve({ projectId: "project-1" }) };

function request(content = "{}") {
  const form = new FormData();
  form.set("file", new File([content], "model.json", { type: "application/json" }));
  return new Request("http://localhost/api/v1/projects/project-1/models", {
    method: "POST",
    headers: {
      authorization: "Bearer aec_test",
      "Idempotency-Key": "model-key"
    },
    body: form
  });
}

describe("v1 model assets API", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("rejects a token without models:write scope", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json([{
      token_id: "token-1",
      project_id: "project-1",
      owner_id: "owner-1",
      created_by: "user-1",
      scopes: ["models:read"]
    }]));
    const response = await POST(request(), context);
    expect(response.status).toBe(403);
  });

  it("returns the original model for an idempotent replay", async () => {
    const content = "{}";
    const contentHash = sha256Hex(new TextEncoder().encode(content));
    const fingerprint = inputFingerprint({
      fileName: "model.json",
      contentHash,
      contentType: "application/json"
    });
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json([{
        token_id: "token-1",
        project_id: "project-1",
        owner_id: "owner-1",
        created_by: "user-1",
        scopes: ["models:write"]
      }]))
      .mockResolvedValueOnce(Response.json([{
        id: "model-1",
        input_fingerprint: fingerprint,
        source_file_name: "model.json",
        source_content_hash: contentHash,
        diagnostics: null,
        created_at: "2026-08-05T20:00:00Z"
      }]));
    const response = await POST(request(content), context);
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data.replayed).toBe(true);
    expect(payload.data.model.id).toBe("model-1");
  });

  it("returns 409 when an idempotency key is reused for different input", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json([{
        token_id: "token-1",
        project_id: "project-1",
        owner_id: "owner-1",
        created_by: "user-1",
        scopes: ["models:write"]
      }]))
      .mockResolvedValueOnce(Response.json([{
        id: "model-1",
        input_fingerprint: "different",
        source_file_name: "model.json",
        source_content_hash: "a".repeat(64),
        diagnostics: null,
        created_at: "2026-08-05T20:00:00Z"
      }]));
    const response = await POST(request('{"changed":true}'), context);
    expect(response.status).toBe(409);
  });
});
