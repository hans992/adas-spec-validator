import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PATCH } from "./route";

const headers = { authorization: "Bearer valid-token", "content-type": "application/json" };
const context = { params: Promise.resolve({ projectId: "project-1" }) };

describe("/api/projects/[projectId]", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("rejects anonymous access", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await PATCH(new Request("http://localhost/api/projects/project-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ baselineValidationId: null })
    }), context);
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forbids non-owners from updating baseline", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id: "user-2" }))
      .mockResolvedValueOnce(Response.json([{ id: "project-1", owner_id: "user-1" }]));

    const response = await PATCH(new Request("http://localhost/api/projects/project-1", {
      method: "PATCH",
      headers,
      body: JSON.stringify({ baselineValidationId: "11111111-1111-1111-1111-111111111111" })
    }), context);

    expect(response.status).toBe(403);
  });

  it("sets baseline after verifying the run belongs to the project", async () => {
    const baselineId = "11111111-1111-1111-1111-111111111111";
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id: "user-1" }))
      .mockResolvedValueOnce(Response.json([{ id: "project-1", owner_id: "user-1" }]))
      .mockResolvedValueOnce(Response.json([{ id: baselineId }]))
      .mockResolvedValueOnce(Response.json([{
        id: "project-1",
        baseline_validation_id: baselineId,
        release_policy: { blockOnNewCritical: true }
      }]));

    const response = await PATCH(new Request("http://localhost/api/projects/project-1", {
      method: "PATCH",
      headers,
      body: JSON.stringify({ baselineValidationId: baselineId })
    }), context);

    expect(response.status).toBe(200);
    const patchCall = fetchMock.mock.calls[3];
    expect(String(patchCall[0])).toContain("projects?id=eq.project-1");
    expect(JSON.parse(String((patchCall[1] as RequestInit).body))).toMatchObject({
      baseline_validation_id: baselineId
    });
  });

  it("rejects a baseline that is not in the project", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id: "user-1" }))
      .mockResolvedValueOnce(Response.json([{ id: "project-1", owner_id: "user-1" }]))
      .mockResolvedValueOnce(Response.json([]));

    const response = await PATCH(new Request("http://localhost/api/projects/project-1", {
      method: "PATCH",
      headers,
      body: JSON.stringify({ baselineValidationId: "11111111-1111-1111-1111-111111111111" })
    }), context);

    expect(response.status).toBe(400);
  });

  it("updates release policy for the owner", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id: "user-1" }))
      .mockResolvedValueOnce(Response.json([{ id: "project-1", owner_id: "user-1" }]))
      .mockResolvedValueOnce(Response.json([{ id: "project-1", release_policy: { maxHighFindings: 2 } }]));

    const policy = {
      blockOnNewCritical: true,
      blockOnDecreasedCoverage: false,
      warnOnNewUnknown: true,
      allowWaivedCritical: true,
      maxHighFindings: 2,
      maxMediumFindings: null
    };
    const response = await PATCH(new Request("http://localhost/api/projects/project-1", {
      method: "PATCH",
      headers,
      body: JSON.stringify({ releasePolicy: policy })
    }), context);

    expect(response.status).toBe(200);
    expect(JSON.parse(String((fetchMock.mock.calls[2][1] as RequestInit).body))).toMatchObject({
      release_policy: policy
    });
  });
});
