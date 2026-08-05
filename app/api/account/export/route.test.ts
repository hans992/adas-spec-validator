import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

describe("account export", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("requires authentication", async () => {
    const response = await GET(new Request("http://localhost/api/account/export"));
    expect(response.status).toBe(401);
  });

  it("exports only the caller's data through their own JWT", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id: "user-1" }))
      .mockResolvedValueOnce(Response.json([{ id: "project-1", name: "Mine" }]))
      .mockResolvedValueOnce(Response.json([{ project_id: "project-2", role: "viewer" }]))
      .mockResolvedValueOnce(Response.json([{ id: "spec-1" }]))
      .mockResolvedValueOnce(Response.json([{ id: "run-1" }]))
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(Response.json([{ id: "ev-1", file_content_hash: "abc" }]));

    const response = await GET(new Request("http://localhost/api/account/export", {
      headers: { authorization: "Bearer user-jwt" }
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toContain("attachment");
    const body = await response.json();
    expect(body.userId).toBe("user-1");
    expect(body.ownedProjects).toHaveLength(1);
    expect(body.validationRuns).toHaveLength(1);
    expect(JSON.stringify(body)).not.toContain("file_content_base64");

    // Every persistence call is scoped by the user's own JWT (RLS enforced).
    expect(String(fetchMock.mock.calls[1][0])).toContain("owner_id=eq.user-1");
    for (const call of fetchMock.mock.calls.slice(1)) {
      const headers = (call[1] as RequestInit).headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer user-jwt");
    }
  });
});
