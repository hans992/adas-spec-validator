import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

describe("/api/internal/jobs/run", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    vi.stubEnv("JOB_RUNNER_SECRET", "runner-secret");
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

  it("rejects ticks without the runner secret", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await POST(new Request("http://localhost/api/internal/jobs/run", { method: "POST" }));
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects ticks when no secret is configured at all", async () => {
    vi.stubEnv("JOB_RUNNER_SECRET", "");
    const response = await POST(new Request("http://localhost/api/internal/jobs/run", {
      method: "POST",
      headers: { authorization: "Bearer runner-secret" }
    }));
    expect(response.status).toBe(401);
  });

  it("processes due jobs and cleans expired payloads", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(Response.json([{ id: "job-old" }]));
    const response = await POST(new Request("http://localhost/api/internal/jobs/run", {
      method: "POST",
      headers: { authorization: "Bearer runner-secret" }
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ processed: 0, cleaned: 1 });
  });
});
