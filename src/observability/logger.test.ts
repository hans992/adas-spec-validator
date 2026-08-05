import { afterEach, describe, expect, it, vi } from "vitest";

import { auditEvent, createRequestLog, logEvent, metricEvent, redactSensitive } from "@/observability/logger";

describe("log redaction", () => {
  afterEach(() => vi.restoreAllMocks());

  it("redacts secrets, credentials, emails, and document content by key", () => {
    const redacted = redactSensitive({
      accessToken: "aec_secret",
      Authorization: "Bearer x",
      password: "hunter2",
      email: "user@example.com",
      fileContentBase64: "AAAA",
      technicalNote: "confidential",
      requestId: "req-1",
      durationMs: 12
    }) as Record<string, unknown>;
    expect(redacted.accessToken).toBe("[redacted]");
    expect(redacted.Authorization).toBe("[redacted]");
    expect(redacted.password).toBe("[redacted]");
    expect(redacted.email).toBe("[redacted]");
    expect(redacted.fileContentBase64).toBe("[redacted]");
    expect(redacted.technicalNote).toBe("[redacted]");
    expect(redacted.requestId).toBe("req-1");
    expect(redacted.durationMs).toBe(12);
  });

  it("redacts nested objects and truncates long strings and huge arrays", () => {
    const redacted = redactSensitive({
      nested: { apiKey: "k", safe: "x".repeat(600) },
      items: Array.from({ length: 100 }, (_, i) => i)
    }) as Record<string, unknown>;
    expect((redacted.nested as Record<string, unknown>).apiKey).toBe("[redacted]");
    expect(String((redacted.nested as Record<string, unknown>).safe)).toContain("[truncated]");
    expect(redacted.items).toBe("[array of 100]");
  });

  it("emits single-line JSON events with timestamps", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logEvent("info", "request.completed", { requestId: "req-1", secretKey: "boom" });
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.event).toBe("request.completed");
    expect(parsed.requestId).toBe("req-1");
    expect(parsed.secretKey).toBe("[redacted]");
    expect(parsed.ts).toMatch(/^\d{4}-/);
  });

  it("tracks request duration and failures without leaking payloads", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const context = createRequestLog("/api/ifc", "req-7");
    context.finish({ status: 200 });
    context.fail(new Error("parse blew up"), { status: 422 });
    const finished = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(finished.route).toBe("/api/ifc");
    expect(finished.durationMs).toBeGreaterThanOrEqual(0);
    const failed = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(failed.message).toBe("parse blew up");
    expect(failed.requestId).toBe("req-7");
  });

  it("prefixes metrics and audit events", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    metricEvent("validation_duration_ms", { value: 123 });
    auditEvent("project.soft_deleted", { actorId: "user-1", projectId: "p-1", outcome: "success" });
    expect(JSON.parse(spy.mock.calls[0][0] as string).event).toBe("metric.validation_duration_ms");
    expect(JSON.parse(spy.mock.calls[1][0] as string).event).toBe("audit.project.soft_deleted");
  });
});
