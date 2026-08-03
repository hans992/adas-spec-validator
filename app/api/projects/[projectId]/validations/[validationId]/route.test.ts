import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

describe("GET validation snapshot", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

  it("loads a full RLS-backed snapshot", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json([{
      id: "run-1", project_id: "project-1", normalized_model: { rooms: [], doors: [], levels: [] }, requirements: []
    }]));
    const response = await GET(new Request("http://localhost/api/projects/project-1/validations/run-1", {
      headers: { authorization: "Bearer valid-token" }
    }), { params: Promise.resolve({ projectId: "project-1", validationId: "run-1" }) });
    expect(response.status).toBe(200);
    expect((await response.json()).validation.id).toBe("run-1");
    expect(fetchMock.mock.calls[0][0]).toContain("id=eq.run-1&project_id=eq.project-1");
    expect(fetchMock.mock.calls[0][0]).toContain("normalized_model");
  });

  it("returns 404 when RLS exposes no matching snapshot", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json([]));
    const response = await GET(new Request("http://localhost/api/projects/project-1/validations/missing", {
      headers: { authorization: "Bearer valid-token" }
    }), { params: Promise.resolve({ projectId: "project-1", validationId: "missing" }) });
    expect(response.status).toBe(404);
  });
});
