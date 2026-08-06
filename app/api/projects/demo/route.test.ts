import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

describe("/api/projects/demo", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

  it("rejects anonymous requests", async () => {
    const response = await POST(new Request("http://localhost/api/projects/demo", { method: "POST" }));
    expect(response.status).toBe(401);
  });

  it("replays an existing demo project without duplicating", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id: "user-1" }))
      .mockResolvedValueOnce(Response.json([])) // ensureAccountPlan
      .mockResolvedValueOnce(Response.json([{ id: "demo-1", name: "Demo — Riverside Office", owner_id: "user-1" }]));

    const response = await POST(new Request("http://localhost/api/projects/demo", {
      method: "POST",
      headers: { authorization: "Bearer valid-token" }
    }));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.replayed).toBe(true);
    expect(payload.project.id).toBe("demo-1");
  });

  it("seeds project, two specs, two runs, baseline and a waiver", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id: "user-1" }))
      .mockResolvedValueOnce(Response.json([])) // ensureAccountPlan
      .mockResolvedValueOnce(Response.json([])) // no existing demo
      .mockResolvedValueOnce(Response.json([])) // resolve plan
      .mockResolvedValueOnce(Response.json([])) // count projects
      .mockResolvedValueOnce(Response.json([{ id: "demo-new", name: "Demo — Riverside Office", owner_id: "user-1" }]))
      .mockResolvedValueOnce(Response.json([{ id: "spec-a" }]))
      .mockResolvedValueOnce(Response.json([{ id: "spec-b" }]))
      .mockResolvedValueOnce(Response.json([{ id: "run-a" }]))
      .mockResolvedValueOnce(Response.json([{ id: "run-b" }]))
      .mockResolvedValueOnce(new Response(null, { status: 204 })) // baseline patch
      .mockResolvedValueOnce(Response.json([{ id: "review-1" }])); // waiver

    const response = await POST(new Request("http://localhost/api/projects/demo", {
      method: "POST",
      headers: { authorization: "Bearer valid-token" }
    }));
    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.baselineValidationId).toBe("run-a");
    expect(payload.candidateValidationId).toBe("run-b");
    expect(payload.specificationIds).toEqual({ revisionA: "spec-a", revisionB: "spec-b" });

    const waiverBody = JSON.parse(String((fetchMock.mock.calls.at(-1)?.[1] as RequestInit).body));
    expect(waiverBody.status).toBe("waived");
    expect(waiverBody.requirement_id).toBe("req-stockroom-door-width");
    expect(waiverBody.waiver_reason).toBeTruthy();
  });
});