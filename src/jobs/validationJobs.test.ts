import { createHash } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  claimDueJob,
  classifyJobError,
  cleanupFinishedJobPayloads,
  processDueJobs,
  runJobStep,
  type ValidationJobRow
} from "@/jobs/validationJobs";
import { PersistenceError } from "@/persistence/supabaseRest";

const model = {
  levels: [{ id: "level-1", name: "Level 1" }],
  rooms: [{ id: "room-1", name: "Stockroom", levelId: "level-1", roomType: "stockroom" as const, areaSqm: 8 }],
  doors: []
};
const requirements = [{
  id: "area-1", title: "Minimum area", type: "minimum_room_area",
  severity: "critical", roomType: "stockroom", minAreaSqm: 15
}];
const modelBytes = Buffer.from(JSON.stringify(model), "utf8");

function job(overrides: Partial<ValidationJobRow> = {}): ValidationJobRow {
  return {
    id: "job-1",
    project_id: "project-1",
    owner_id: "user-1",
    created_by: "user-1",
    status: "processing",
    phase: "queued",
    progress_percent: 5,
    input_file_name: "model.json",
    input_content_base64: modelBytes.toString("base64"),
    input_content_hash: createHash("sha256").update(modelBytes).digest("hex"),
    specification_package_id: "spec-1",
    working_state: null,
    attempts: 0,
    max_attempts: 3,
    timeout_seconds: 300,
    cancel_requested: false,
    started_at: new Date().toISOString(),
    ...overrides
  };
}

function requestBody(call: [unknown, unknown?]): Record<string, unknown> {
  return JSON.parse(String((call[1] as RequestInit).body));
}

describe("classifyJobError", () => {
  it("retries only safe infrastructure errors", () => {
    expect(classifyJobError(new PersistenceError("down", 503)).retryable).toBe(true);
    expect(classifyJobError(new PersistenceError("throttled", 429)).retryable).toBe(true);
    expect(classifyJobError(new PersistenceError("missing", 404)).retryable).toBe(false);
    expect(classifyJobError(new PersistenceError("bad input", 422)).retryable).toBe(false);
    expect(classifyJobError(new TypeError("fetch failed")).retryable).toBe(true);
    expect(classifyJobError(new Error("IFC parse exceeded the 30000ms time limit")).retryable).toBe(false);
    expect(classifyJobError("boom").retryable).toBe(false);
  });
});

describe("runJobStep", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

  it("parses the model, clears the temporary payload and re-queues for validation", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json([job()]));
    const status = await runJobStep(job());
    expect(status).toBe("queued");
    const patch = requestBody(fetchMock.mock.calls[0]);
    expect(patch.phase).toBe("validating");
    expect(patch.input_content_base64).toBeNull();
    expect((patch.working_state as { model: typeof model }).model.rooms[0].id).toBe("room-1");
  });

  it("fails without retry when the payload checksum no longer matches", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json([job()]));
    const status = await runJobStep(job({ input_content_hash: "0".repeat(64) }));
    expect(status).toBe("failed");
    const patch = requestBody(fetchMock.mock.calls[0]);
    expect(patch.status).toBe("failed");
    expect(patch.error_retryable).toBe(false);
    expect(patch.dead_lettered_at).toBeUndefined();
    // Parse never succeeded: keep the payload so a manual retry can resume.
    expect(patch.input_content_base64).not.toBeNull();
  });

  it("fails invalid model JSON with an understandable, non-retryable error", async () => {
    const bytes = Buffer.from("{\"levels\":[]}", "utf8");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json([job()]));
    const status = await runJobStep(job({
      input_content_base64: bytes.toString("base64"),
      input_content_hash: createHash("sha256").update(bytes).digest("hex")
    }));
    expect(status).toBe("failed");
    const patch = requestBody(fetchMock.mock.calls[0]);
    expect(patch.error_retryable).toBe(false);
    expect(String(patch.last_error)).toContain("Model schema error");
  });

  it("cancels before doing any work when cancellation was requested", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json([job()]));
    const status = await runJobStep(job({ cancel_requested: true }));
    expect(status).toBe("cancelled");
    const patch = requestBody(fetchMock.mock.calls[0]);
    expect(patch.status).toBe("cancelled");
    expect(patch.input_content_base64).toBeNull();
    expect(patch.working_state).toBeNull();
  });

  it("times out jobs that exceed their wall-clock budget", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json([job()]));
    const status = await runJobStep(job({
      started_at: new Date(Date.now() - 600_000).toISOString(),
      timeout_seconds: 300
    }));
    expect(status).toBe("failed");
    expect(String(requestBody(fetchMock.mock.calls[0]).last_error)).toContain("300s processing budget");
  });

  it("validates against the stored specification and advances to persisting", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json([{ id: "spec-1", requirements }]))
      .mockResolvedValueOnce(Response.json([job()]));
    const status = await runJobStep(job({ phase: "validating", working_state: { model } }));
    expect(status).toBe("queued");
    const patch = requestBody(fetchMock.mock.calls[1]);
    expect(patch.phase).toBe("persisting");
    const state = patch.working_state as { results: unknown[]; metrics: unknown };
    expect(state.results.length).toBeGreaterThan(0);
    expect(state.metrics).toBeTruthy();
  });

  it("schedules a backoff retry for transient persistence failures", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("upstream down", { status: 503 }))
      .mockResolvedValueOnce(Response.json([job()]));
    const now = Date.now();
    const status = await runJobStep(job({ phase: "validating", working_state: { model } }), now);
    expect(status).toBe("queued");
    const patch = requestBody(fetchMock.mock.calls[1]);
    expect(patch.status).toBe("queued");
    expect(patch.attempts).toBe(1);
    expect(new Date(String(patch.next_run_at)).getTime()).toBeGreaterThan(now);
  });

  it("dead-letters retryable failures once attempts are exhausted", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("upstream down", { status: 503 }))
      .mockResolvedValueOnce(Response.json([job()]));
    const status = await runJobStep(job({ phase: "validating", working_state: { model }, attempts: 2 }));
    expect(status).toBe("failed");
    const patch = requestBody(fetchMock.mock.calls[1]);
    expect(patch.status).toBe("failed");
    expect(typeof patch.dead_lettered_at).toBe("string");
  });

  it("persists artifacts idempotently by reusing existing rows on retry", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json([{ id: "asset-1" }]))
      .mockResolvedValueOnce(Response.json([{ id: "run-1" }]))
      .mockResolvedValueOnce(Response.json([job()]));
    const status = await runJobStep(job({
      phase: "persisting",
      working_state: { model, requirements: requirements as never, results: [], metrics: {} }
    }));
    expect(status).toBe("completed");
    expect(fetchMock.mock.calls.every((call) => (call[1] as RequestInit).method !== "POST")).toBe(true);
    const patch = requestBody(fetchMock.mock.calls[2]);
    expect(patch).toMatchObject({ status: "completed", model_asset_id: "asset-1", validation_run_id: "run-1" });
    expect(patch.working_state).toBeNull();
  });

  it("creates the model asset and validation run on a first persist", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(Response.json([{ id: "asset-new" }]))
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(Response.json([{ id: "run-new" }]))
      .mockResolvedValueOnce(Response.json([job()]));
    const status = await runJobStep(job({
      phase: "persisting",
      working_state: { model, requirements: requirements as never, results: [], metrics: {} }
    }));
    expect(status).toBe("completed");
    const assetInsert = requestBody(fetchMock.mock.calls[1]);
    expect(assetInsert.idempotency_key).toBe("job:job-1:model");
    const runInsert = requestBody(fetchMock.mock.calls[3]);
    expect(runInsert.idempotency_key).toBe("job:job-1:run");
    expect(runInsert.model_asset_id).toBe("asset-new");
  });
});

describe("claimDueJob and worker loop", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

  it("claims a due queued job atomically", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json([{ ...job(), status: "queued", next_run_at: new Date(0).toISOString() }]))
      .mockResolvedValueOnce(Response.json([job()]));
    const claimed = await claimDueJob();
    expect(claimed?.id).toBe("job-1");
    expect(String(fetchMock.mock.calls[1][0])).toContain("status=eq.queued");
    expect(requestBody(fetchMock.mock.calls[1]).status).toBe("processing");
  });

  it("returns null when another worker wins the claim race", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json([{ ...job(), status: "queued", next_run_at: new Date(0).toISOString() }]))
      .mockResolvedValueOnce(Response.json([]));
    expect(await claimDueJob()).toBeNull();
  });

  it("re-queues a crashed job whose lease expired and counts the attempt", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json([{
        ...job(), status: "processing", attempts: 0,
        lease_expires_at: new Date(Date.now() - 60_000).toISOString()
      }]))
      .mockResolvedValueOnce(Response.json([job()]));
    expect(await claimDueJob()).toBeNull();
    const patch = requestBody(fetchMock.mock.calls[1]);
    expect(patch.status).toBe("queued");
    expect(patch.attempts).toBe(1);
  });

  it("dead-letters a job whose lease expires with attempts exhausted", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json([{
        ...job(), status: "processing", attempts: 2,
        lease_expires_at: new Date(Date.now() - 60_000).toISOString()
      }]))
      .mockResolvedValueOnce(Response.json([job()]));
    expect(await claimDueJob()).toBeNull();
    const patch = requestBody(fetchMock.mock.calls[1]);
    expect(patch.status).toBe("failed");
    expect(typeof patch.dead_lettered_at).toBe("string");
    expect(patch.input_content_base64).toBeNull();
  });

  it("processes due jobs until the queue is empty", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json([{ ...job(), status: "queued", next_run_at: new Date(0).toISOString() }]))
      .mockResolvedValueOnce(Response.json([job()]))
      .mockResolvedValueOnce(Response.json([job()]))
      .mockResolvedValueOnce(Response.json([]));
    expect(await processDueJobs(5)).toBe(1);
  });
});

describe("cleanupFinishedJobPayloads", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

  it("clears payloads and working state from old terminal jobs", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json([{ id: "job-1" }, { id: "job-2" }]));
    expect(await cleanupFinishedJobPayloads(24)).toBe(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain("status=in.(failed,cancelled,completed)");
    const patch = requestBody(fetchMock.mock.calls[0]);
    expect(patch.input_content_base64).toBeNull();
    expect(patch.working_state).toBeNull();
  });
});
