import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "./route";

const headers = { authorization: "Bearer valid-token", "content-type": "application/json" };

describe("/api/projects", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("rejects anonymous access before contacting persistence", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await GET(new Request("http://localhost/api/projects"));
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("creates a project owned by the authenticated user", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id: "user-1" }))
      .mockResolvedValueOnce(Response.json([{ id: "project-1", name: "Airport terminal" }]));

    const response = await POST(new Request("http://localhost/api/projects", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Airport terminal" })
    }));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ project: { id: "project-1", name: "Airport terminal" } });
    const persistenceCall = fetchMock.mock.calls[1];
    expect(persistenceCall[0]).toBe("https://example.supabase.co/rest/v1/projects");
    expect(JSON.parse(String((persistenceCall[1] as RequestInit).body))).toMatchObject({ owner_id: "user-1" });
  });

  it("rejects invalid project names without writing", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ id: "user-1" }));
    const response = await POST(new Request("http://localhost/api/projects", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "" })
    }));
    expect(response.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
