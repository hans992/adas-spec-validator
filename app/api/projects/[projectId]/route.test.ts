import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DELETE, PATCH } from "./route";

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

describe("project lifecycle (soft delete, restore, permanent delete)", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  const deleteRequest = (query = "") => new Request(`http://localhost/api/projects/project-1${query}`, {
    method: "DELETE",
    headers: { authorization: "Bearer valid-token" }
  });

  it("returns 404 for a foreign project guessed by ID (RLS hides it)", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id: "attacker" }))
      .mockResolvedValueOnce(Response.json([]));
    const response = await DELETE(deleteRequest(), context);
    expect(response.status).toBe(404);
  });

  it("forbids members from deleting a project they can see", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id: "member-1" }))
      .mockResolvedValueOnce(Response.json([{ id: "project-1", owner_id: "user-1", deleted_at: null }]));
    const response = await DELETE(deleteRequest(), context);
    expect(response.status).toBe(403);
  });

  it("soft deletes for the owner and supports restore", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id: "user-1" }))
      .mockResolvedValueOnce(Response.json([{ id: "project-1", owner_id: "user-1", deleted_at: null }]))
      .mockResolvedValueOnce(Response.json([{ id: "project-1", deleted_at: "2026-08-05T21:00:00.000Z" }]));
    const response = await DELETE(deleteRequest(), context);
    expect(response.status).toBe(200);
    expect((await response.json()).deleted).toBe(true);
    const patch = JSON.parse(String((fetchMock.mock.calls[2][1] as RequestInit).body));
    expect(typeof patch.deleted_at).toBe("string");

    vi.restoreAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    const restoreMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id: "user-1" }))
      .mockResolvedValueOnce(Response.json([{ id: "project-1", owner_id: "user-1", deleted_at: "2026-08-05T21:00:00.000Z" }]))
      .mockResolvedValueOnce(Response.json([{ id: "project-1", deleted_at: null }]));
    const restored = await DELETE(deleteRequest("?action=restore"), context);
    expect(restored.status).toBe(200);
    expect((await restored.json()).deleted).toBe(false);
    expect(JSON.parse(String((restoreMock.mock.calls[2][1] as RequestInit).body)).deleted_at).toBeNull();
  });

  it("permanently deletes only when explicitly requested", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id: "user-1" }))
      .mockResolvedValueOnce(Response.json([{ id: "project-1", owner_id: "user-1", deleted_at: "2026-08-01T00:00:00.000Z" }]))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const response = await DELETE(deleteRequest("?action=permanent"), context);
    expect(response.status).toBe(200);
    expect((await response.json()).permanent).toBe(true);
    expect((fetchMock.mock.calls[2][1] as RequestInit).method).toBe("DELETE");
  });

  it("rejects unknown lifecycle actions", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ id: "user-1" }));
    const response = await DELETE(deleteRequest("?action=nuke"), context);
    expect(response.status).toBe(400);
  });
});
