import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET, POST } from "./route";

const context = { params: Promise.resolve({ projectId: "project-1", validationId: "run-1" }) };

describe("finding evidence API", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("lists evidence without file payloads by default", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id: "user-1" }))
      .mockResolvedValueOnce(Response.json([]));
    const response = await GET(new Request("http://localhost/evidence", { headers: { authorization: "Bearer token" } }), context);
    expect(response.status).toBe(200);
    expect(String(fetchMock.mock.calls[1][0])).toContain("finding_evidence");
    expect(String(fetchMock.mock.calls[1][0])).not.toContain("file_content_base64");
  });

  it("hashes attachments and persists comment evidence", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id: "user-1" }))
      .mockResolvedValueOnce(Response.json([{
        owner_id: "owner-1",
        requirements: [{ id: "req-1" }],
        results: [{ requirementId: "req-1", ruleId: "rule-1" }]
      }]))
      .mockResolvedValueOnce(Response.json([{ id: "ev-1", kind: "comment" }]));
    const response = await POST(new Request("http://localhost/evidence", {
      method: "POST",
      headers: { authorization: "Bearer token", "content-type": "application/json" },
      body: JSON.stringify({
        requirementId: "req-1",
        findingKey: "req-1|rule-1|room-1",
        kind: "comment",
        title: "Site visit",
        comment: "Confirmed on site."
      })
    }), context);
    expect(response.status).toBe(201);
    const persisted = JSON.parse(String((fetchMock.mock.calls[2][1] as RequestInit).body));
    expect(persisted).toMatchObject({
      project_id: "project-1",
      validation_run_id: "run-1",
      created_by: "user-1",
      kind: "comment",
      comment: "Confirmed on site."
    });
  });

  it("rejects forged requirement ids", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id: "user-1" }))
      .mockResolvedValueOnce(Response.json([{ owner_id: "owner-1", requirements: [{ id: "req-1" }], results: [] }]));
    const response = await POST(new Request("http://localhost/evidence", {
      method: "POST",
      headers: { authorization: "Bearer token", "content-type": "application/json" },
      body: JSON.stringify({
        requirementId: "forged",
        findingKey: "x",
        kind: "comment",
        title: "Note",
        comment: "Nope"
      })
    }), context);
    expect(response.status).toBe(400);
  });

  it("requires evidenceId for delete", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ id: "user-1" }));
    const response = await DELETE(new Request("http://localhost/evidence", {
      method: "DELETE",
      headers: { authorization: "Bearer token" }
    }), context);
    expect(response.status).toBe(400);
  });
});
