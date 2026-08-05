import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "./route";

const model = {
  levels: [{ id: "level-1", name: "Level 1" }],
  rooms: [{ id: "room-1", name: "Stockroom", levelId: "level-1", roomType: "stockroom", areaSqm: 8 }],
  doors: []
};
const specificationId = "22222222-2222-4222-8222-222222222222";

function enqueueRequest(projectId: string, file: File, spec = specificationId): [Request, { params: Promise<{ projectId: string }> }] {
  const form = new FormData();
  form.append("file", file);
  form.append("specificationId", spec);
  return [
    new Request(`http://localhost/api/projects/${projectId}/jobs`, {
      method: "POST",
      headers: { authorization: "Bearer valid-token" },
      body: form
    }),
    { params: Promise.resolve({ projectId }) }
  ];
}

const jobRow = { id: "job-1", status: "queued", phase: "queued", progress_percent: 0, input_content_base64: "x" };

describe("/api/projects/[projectId]/jobs", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

  it("rejects anonymous job submissions", async () => {
    const [request, context] = enqueueRequest("p-anon", new File(["{}"], "model.json"));
    request.headers.delete?.("authorization");
    const response = await POST(new Request(request.url, { method: "POST", body: new FormData() }), context);
    expect(response.status).toBe(401);
  });

  it("enqueues a job and never echoes the payload back", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id: "user-1" }))
      .mockResolvedValueOnce(Response.json([{ id: "p-happy", owner_id: "owner-1" }]))
      .mockResolvedValueOnce(Response.json([{ id: specificationId }]))
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(Response.json([jobRow]));

    const file = new File([JSON.stringify(model)], "model.json", { type: "application/json" });
    const response = await POST(...enqueueRequest("p-happy", file));
    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.job.id).toBe("job-1");
    expect(payload.job.input_content_base64).toBeUndefined();
    expect(payload.replayed).toBe(false);

    const insert = JSON.parse(String((fetchMock.mock.calls[4][1] as RequestInit).body));
    expect(insert.owner_id).toBe("owner-1");
    expect(insert.created_by).toBe("user-1");
    expect(typeof insert.input_content_base64).toBe("string");
    expect(insert.input_content_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("replays an existing job for a repeated Idempotency-Key", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id: "user-1" }))
      .mockResolvedValueOnce(Response.json([{ id: "p-replay", owner_id: "owner-1" }]))
      .mockResolvedValueOnce(Response.json([{ id: specificationId }]))
      .mockResolvedValueOnce(Response.json([jobRow]));

    const form = new FormData();
    form.append("file", new File([JSON.stringify(model)], "model.json", { type: "application/json" }));
    form.append("specificationId", specificationId);
    const response = await POST(new Request("http://localhost/api/projects/p-replay/jobs", {
      method: "POST",
      headers: { authorization: "Bearer valid-token", "Idempotency-Key": "retry-123" },
      body: form
    }), { params: Promise.resolve({ projectId: "p-replay" }) });

    expect(response.status).toBe(200);
    expect((await response.json()).replayed).toBe(true);
  });

  it("rejects disguised binary content before anything is stored", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ id: "user-1" }));
    const zipBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x20, 0x20]);
    const response = await POST(...enqueueRequest("p-guard", new File([zipBytes], "model.json", { type: "application/json" })));
    expect(response.status).toBe(415);
  });

  it("requires a specification from the same project", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id: "user-1" }))
      .mockResolvedValueOnce(Response.json([{ id: "p-spec", owner_id: "owner-1" }]))
      .mockResolvedValueOnce(Response.json([]));
    const file = new File([JSON.stringify(model)], "model.json", { type: "application/json" });
    const response = await POST(...enqueueRequest("p-spec", file));
    expect(response.status).toBe(400);
  });

  it("lists jobs for project participants", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id: "user-1" }))
      .mockResolvedValueOnce(Response.json([{ id: "job-1", status: "completed" }]));
    const response = await GET(new Request("http://localhost/api/projects/p-list/jobs", {
      headers: { authorization: "Bearer valid-token" }
    }), { params: Promise.resolve({ projectId: "p-list" }) });
    expect(response.status).toBe(200);
    expect((await response.json()).jobs).toHaveLength(1);
    expect(String(fetchMock.mock.calls[1][0])).not.toContain("input_content_base64");
  });
});
