/**
 * Structured JSON logging with automatic redaction.
 *
 * Every event is a single JSON line on stdout/stderr so any log collector
 * (Vercel, Datadog, Loki, …) can index it. Values whose keys look sensitive —
 * tokens, passwords, emails, document content — are replaced with "[redacted]"
 * before serialization so secrets and customer documents never reach the logs.
 */

export type LogLevel = "info" | "warn" | "error";

const SENSITIVE_KEY_PATTERN =
  /token|secret|password|authorization|api[-_]?key|cookie|session|email|content|base64|body|text|fragments|quote|snippet|comment|note/i;

const MAX_STRING_LENGTH = 500;
const MAX_DEPTH = 6;

export function redactSensitive(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return "[truncated]";
  if (typeof value === "string") {
    return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}…[truncated]` : value;
  }
  if (typeof value !== "object" || value === null) return value;
  if (Array.isArray(value)) {
    return value.length > 50 ? `[array of ${value.length}]` : value.map((item) => redactSensitive(item, depth + 1));
  }
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    result[key] = SENSITIVE_KEY_PATTERN.test(key) ? "[redacted]" : redactSensitive(entry, depth + 1);
  }
  return result;
}

export function logEvent(level: LogLevel, event: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...(redactSensitive(fields) as Record<string, unknown>)
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** Emits an operational metric as a structured log event (counter or duration). */
export function metricEvent(name: string, fields: Record<string, unknown> = {}): void {
  logEvent("info", `metric.${name}`, fields);
}

export interface RequestLogContext {
  requestId: string;
  route: string;
  startedAt: number;
  log: (level: LogLevel, event: string, fields?: Record<string, unknown>) => void;
  finish: (fields?: Record<string, unknown>) => void;
  fail: (error: unknown, fields?: Record<string, unknown>) => void;
}

export function createRequestLog(route: string, requestId = crypto.randomUUID()): RequestLogContext {
  const startedAt = Date.now();
  const base = { requestId, route };
  return {
    requestId,
    route,
    startedAt,
    log: (level, event, fields = {}) => logEvent(level, event, { ...base, ...fields }),
    finish: (fields = {}) =>
      logEvent("info", "request.completed", { ...base, durationMs: Date.now() - startedAt, ...fields }),
    fail: (error, fields = {}) =>
      logEvent("error", "request.failed", {
        ...base,
        durationMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : String(error),
        ...fields
      })
  };
}

/**
 * Audit events describe who did what, never document content. Persisted app-side
 * as structured logs; destructive operations additionally write to the
 * audit_events table through the service role.
 */
export function auditEvent(event: string, fields: {
  requestId?: string;
  actorId?: string;
  projectId?: string;
  targetId?: string;
  outcome?: "success" | "denied" | "failure";
  detail?: string;
}): void {
  logEvent("info", `audit.${event}`, fields);
}
