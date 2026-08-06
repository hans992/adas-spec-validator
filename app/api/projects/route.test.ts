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
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id: "user-1" }))
      .mockResolvedValueOnce(Response.json([])) // ensureAccountPlan
      .mockResolvedValueOnce(Response.json([])) // resolve plan → starter
      .mockResolvedValueOnce(Response.json([])) // owned projects count
      .mockResolvedValueOnce(Response.json([{ id: "project-1", name: "Airport terminal" }]));

    const response = await POST(new Request("http://localhost/api/projects", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Airport terminal" })
    }));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ project: { id: "project-1", name: "Airport terminal" } });
    const persistenceCall = fetchMock.mock.calls[4];
    expect(String(persistenceCall[0])).toContain("/rest/v1/projects");
    expect(JSON.parse(String((persistenceCall[1] as RequestInit).body))).toMatchObject({ owner_id: "user-1" });
  });

  it("rejects invalid project names without writing", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id: "user-1" }))
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(Response.json([]));
    const response = await POST(new Request("http://localhost/api/projects", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "" })
    }));
    expect(response.status).toBe(400);
    expect(fetchMock.mock.calls.some((call) =>
      String(call[0]).endsWith("/rest/v1/projects") && (call[1] as RequestInit)?.method === "POST"
    )).toBe(false);
  });

  it("returns 402 when the starter project cap is reached", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id: "user-1" }))
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(Response.json([{ id: "p1" }, { id: "p2" }]));
    const response = await POST(new Request("http://localhost/api/projects", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Overflow" })
    }));
    expect(response.status).toBe(402);
  });
});