import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, PUT } from "./route";

const context = { params: Promise.resolve({ projectId: "project-1", validationId: "run-1" }) };
const request = (body: unknown) => new Request("http://localhost/api/projects/project-1/validations/run-1/reviews", {
  method: "PUT", headers: { authorization: "Bearer token", "content-type": "application/json" }, body: JSON.stringify(body)
});

describe("validation review API", () => {
  beforeEach(() => { vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon"); });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

  it("lists reviews through project and run filters", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ id: "user-1" })).mockResolvedValueOnce(Response.json([]));
    const response = await GET(new Request("http://localhost/reviews", { headers: { authorization: "Bearer token" } }), context);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ reviews: [], history: [] });
    expect(fetchMock.mock.calls[1][0]).toContain("project_id=eq.project-1&validation_run_id=eq.run-1");
  });

  it("includes superseded history when requested", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id: "user-1" }))
      .mockResolvedValueOnce(Response.json([{ requirement_id: "req-1", status: "resolved" }]))
      .mockResolvedValueOnce(Response.json([{ decision_id: "old", requirement_id: "req-1", status: "open" }]));
    const response = await GET(new Request("http://localhost/reviews?history=1", { headers: { authorization: "Bearer token" } }), context);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.reviews).toHaveLength(1);
    expect(body.history).toHaveLength(1);
    expect(String(fetchMock.mock.calls[2][0])).toContain("validation_review_history");
  });

  it("verifies the requirement belongs to the run before upserting", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id: "user-1" }))
      .mockResolvedValueOnce(Response.json([{ owner_id: "owner-1", requirements: [{ id: "req-1" }] }]))
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(Response.json([{ requirement_id: "req-1", status: "acknowledged", decision_id: "dec-1" }]));
    const response = await PUT(request({ requirementId: "req-1", status: "acknowledged", comment: "Accepted for review." }), context);
    expect(response.status).toBe(200);
    const persisted = JSON.parse(String((fetchMock.mock.calls[3][1] as RequestInit).body));
    expect(persisted).toMatchObject({
      validation_run_id: "run-1",
      project_id: "project-1",
      owner_id: "owner-1",
      updated_by: "user-1",
      requirement_id: "req-1",
      status: "acknowledged",
      waiver_reason: null,
      waiver_expires_at: null
    });
    expect(persisted.decision_id).toMatch(/^[0-9a-f-]{36}$/i);
    expect((fetchMock.mock.calls[3][1] as RequestInit).headers).toMatchObject({ Prefer: "resolution=merge-duplicates,return=representation" });
  });

  it("archives the previous decision before superseding it", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id: "user-1" }))
      .mockResolvedValueOnce(Response.json([{ owner_id: "owner-1", requirements: [{ id: "req-1" }] }]))
      .mockResolvedValueOnce(Response.json([{
        id: "row-1",
        decision_id: "dec-old",
        requirement_id: "req-1",
        status: "open",
        comment: "Opened",
        waiver_reason: null,
        waiver_expires_at: null,
        updated_by: "user-0",
        updated_at: "2026-08-01T10:00:00.000Z"
      }]))
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(Response.json([{ requirement_id: "req-1", status: "waived", decision_id: "dec-new" }]));
    const response = await PUT(request({
      requirementId: "req-1",
      status: "waived",
      comment: "Accepted as-is",
      waiverReason: "Existing building",
      waiverExpiresAt: "2027-01-01T00:00:00.000Z"
    }), context);
    expect(response.status).toBe(200);
    expect(String(fetchMock.mock.calls[3][0])).toContain("validation_review_history");
    const archived = JSON.parse(String((fetchMock.mock.calls[3][1] as RequestInit).body));
    expect(archived).toMatchObject({
      decision_id: "dec-old",
      status: "open",
      reviewer_id: "user-0",
      superseded_by_decision_id: expect.any(String)
    });
    const persisted = JSON.parse(String((fetchMock.mock.calls[4][1] as RequestInit).body));
    expect(persisted).toMatchObject({
      status: "waived",
      waiver_reason: "Existing building",
      waiver_expires_at: "2027-01-01T00:00:00.000Z"
    });
  });

  it("rejects waived decisions without a waiver reason", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ id: "user-1" }));
    const response = await PUT(request({ requirementId: "req-1", status: "waived", comment: "" }), context);
    expect(response.status).toBe(400);
  });

  it("rejects a requirement that is not part of the stored snapshot", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ id: "user-1" })).mockResolvedValueOnce(Response.json([{ requirements: [{ id: "req-1" }] }]));
    const response = await PUT(request({ requirementId: "forged", status: "waived", comment: "", waiverReason: "n/a" }), context);
    expect(response.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects unknown statuses and extra fields", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ id: "user-1" }));
    const response = await PUT(request({ requirementId: "req-1", status: "approved", comment: "", ownerId: "other" }), context);
    expect(response.status).toBe(400);
  });
});
