import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "./route";

const context = { params: Promise.resolve({ projectId: "project-1", jobId: "job-1" }) };
const headers = { authorization: "Bearer valid-token", "content-type": "application/json" };

function jobRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    status: "queued",
    phase: "queued",
    progress_percent: 5,
    input_content_base64: "payload",
    next_run_at: new Date(Date.now() + 60_000).toISOString(),
    lease_expires_at: null,
    created_by: "user-1",
    ...overrides
  };
}

describe("/api/projects/[projectId]/jobs/[jobId]", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

  it("returns job status without the payload and reports has_payload instead", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id: "user-1" }))
      .mockResolvedValueOnce(Response.json([jobRow()]));
    const response = await GET(new Request("http://localhost/api/projects/project-1/jobs/job-1", { headers }), context);
    expect(response.status).toBe(200);
    const { job } = await response.json();
    expect(job.input_content_base64).toBeUndefined();
    expect(job.has_payload).toBe(true);
  });

  it("hides foreign jobs guessed by ID (RLS returns nothing)", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id: "attacker" }))
      .mockResolvedValueOnce(Response.json([]));
    const response = await GET(new Request("http://localhost/api/projects/project-1/jobs/job-1", { headers }), context);
    expect(response.status).toBe(404);
  });

  it("drives one worker step when polling a due job", async () => {
    const dueJob = jobRow({ next_run_at: new Date(Date.now() - 1000).toISOString() });
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id: "user-1" }))
      .mockResolvedValueOnce(Response.json([dueJob]))
      .mockResolvedValueOnce(Response.json([]))       // claim candidates (already taken elsewhere)
      .mockResolvedValueOnce(Response.json([jobRow({ status: "processing" })]));
    const response = await GET(new Request("http://localhost/api/projects/project-1/jobs/job-1", { headers }), context);
    expect(response.status).toBe(200);
    expect((await response.json()).job.status).toBe("processing");
    expect(String(fetchMock.mock.calls[2][0])).toContain("validation_jobs?or=");
  });

  it("cancels a queued job immediately and cleans its payload", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id: "user-1" }))
      .mockResolvedValueOnce(Response.json([jobRow()]))
      .mockResolvedValueOnce(Response.json([{ owner_id: "owner-9" }]))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(Response.json([jobRow({ status: "cancelled" })]));
    const response = await POST(new Request("http://localhost/api/projects/project-1/jobs/job-1", {
      method: "POST", headers, body: JSON.stringify({ action: "cancel" })
    }), context);
    expect(response.status).toBe(200);
    const patch = JSON.parse(String((fetchMock.mock.calls[3][1] as RequestInit).body));
    expect(patch.status).toBe("cancelled");
    expect(patch.input_content_base64).toBeNull();
  });

  it("only flags cancellation for a processing job so the runner can stop safely", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id: "user-1" }))
      .mockResolvedValueOnce(Response.json([jobRow({ status: "processing", phase: "validating" })]))
      .mockResolvedValueOnce(Response.json([{ owner_id: "owner-9" }]))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(Response.json([jobRow({ status: "processing", cancel_requested: true })]));
    const response = await POST(new Request("http://localhost/api/projects/project-1/jobs/job-1", {
      method: "POST", headers, body: JSON.stringify({ action: "cancel" })
    }), context);
    expect(response.status).toBe(200);
    const patch = JSON.parse(String((fetchMock.mock.calls[3][1] as RequestInit).body));
    expect(patch.cancel_requested).toBe(true);
    expect(patch.status).toBeUndefined();
  });

  it("forbids members who neither created the job nor own the project", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id: "member-2" }))
      .mockResolvedValueOnce(Response.json([jobRow({ created_by: "user-1" })]))
      .mockResolvedValueOnce(Response.json([{ owner_id: "owner-9" }]));
    const response = await POST(new Request("http://localhost/api/projects/project-1/jobs/job-1", {
      method: "POST", headers, body: JSON.stringify({ action: "cancel" })
    }), context);
    expect(response.status).toBe(403);
  });

  it("retries a failed job by resetting its attempts and errors", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id: "user-1" }))
      .mockResolvedValueOnce(Response.json([jobRow({ status: "failed", phase: "persisting", input_content_base64: null })]))
      .mockResolvedValueOnce(Response.json([{ owner_id: "owner-9" }]))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(Response.json([jobRow({ status: "queued", phase: "persisting" })]));
    const response = await POST(new Request("http://localhost/api/projects/project-1/jobs/job-1", {
      method: "POST", headers, body: JSON.stringify({ action: "retry" })
    }), context);
    expect(response.status).toBe(200);
    const patch = JSON.parse(String((fetchMock.mock.calls[3][1] as RequestInit).body));
    expect(patch).toMatchObject({ status: "queued", attempts: 0, dead_lettered_at: null, last_error: null });
  });

  it("refuses to retry a failed parse whose payload was already cleaned up", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id: "user-1" }))
      .mockResolvedValueOnce(Response.json([jobRow({ status: "failed", phase: "parsing", input_content_base64: null })]))
      .mockResolvedValueOnce(Response.json([{ owner_id: "owner-9" }]));
    const response = await POST(new Request("http://localhost/api/projects/project-1/jobs/job-1", {
      method: "POST", headers, body: JSON.stringify({ action: "retry" })
    }), context);
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("cleaned up");
  });

  it("refuses to retry or cancel jobs in the wrong state", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id: "user-1" }))
      .mockResolvedValueOnce(Response.json([jobRow({ status: "completed" })]))
      .mockResolvedValueOnce(Response.json([{ owner_id: "owner-9" }]));
    const response = await POST(new Request("http://localhost/api/projects/project-1/jobs/job-1", {
      method: "POST", headers, body: JSON.stringify({ action: "cancel" })
    }), context);
    expect(response.status).toBe(409);
  });

  it("rejects unknown actions", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ id: "user-1" }));
    const response = await POST(new Request("http://localhost/api/projects/project-1/jobs/job-1", {
      method: "POST", headers, body: JSON.stringify({ action: "pause" })
    }), context);
    expect(response.status).toBe(400);
  });
});
