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
    expect(fetchMock.mock.calls[1][0]).toContain("project_id=eq.project-1&validation_run_id=eq.run-1");
  });

  it("verifies the requirement belongs to the run before upserting", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id: "user-1" }))
      .mockResolvedValueOnce(Response.json([{ owner_id: "owner-1", requirements: [{ id: "req-1" }] }]))
      .mockResolvedValueOnce(Response.json([{ requirement_id: "req-1", status: "acknowledged" }]));
    const response = await PUT(request({ requirementId: "req-1", status: "acknowledged", comment: "Accepted for review." }), context);
    expect(response.status).toBe(200);
    const persisted = JSON.parse(String((fetchMock.mock.calls[2][1] as RequestInit).body));
    expect(persisted).toMatchObject({ validation_run_id: "run-1", project_id: "project-1", owner_id: "owner-1", updated_by: "user-1", requirement_id: "req-1" });
    expect((fetchMock.mock.calls[2][1] as RequestInit).headers).toMatchObject({ Prefer: "resolution=merge-duplicates,return=representation" });
  });

  it("rejects a requirement that is not part of the stored snapshot", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ id: "user-1" })).mockResolvedValueOnce(Response.json([{ requirements: [{ id: "req-1" }] }]));
    const response = await PUT(request({ requirementId: "forged", status: "waived", comment: "" }), context);
    expect(response.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects unknown statuses and extra fields", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ id: "user-1" }));
    const response = await PUT(request({ requirementId: "req-1", status: "approved", comment: "", ownerId: "other" }), context);
    expect(response.status).toBe(400);
  });
});
