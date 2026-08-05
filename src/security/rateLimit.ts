/**
 * Shared fixed-window rate limiting.
 *
 * When UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are configured, limits are
 * enforced in a shared Redis so every serverless instance sees the same counters.
 * Without Redis (local development, tests) an in-memory fallback keeps the same
 * behavior per process. Redis outages fail open so availability is preserved;
 * the failure is surfaced through a structured log event.
 */
import { logEvent } from "@/observability/logger";

export type RateLimitScope = "auth" | "chat" | "upload" | "validation";

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
  limit: number;
  remaining: number;
}

const SCOPE_LIMITS: Record<RateLimitScope, { windowMs: number; maxRequests: number }> = {
  auth: { windowMs: 15 * 60_000, maxRequests: 10 },
  chat: { windowMs: 60_000, maxRequests: 20 },
  upload: { windowMs: 60_000, maxRequests: 12 },
  validation: { windowMs: 60_000, maxRequests: 6 }
};

interface MemoryBucket {
  count: number;
  resetAt: number;
}

const memoryBuckets = new Map<string, MemoryBucket>();
const memoryJobSlots = new Map<string, number>();

function upstashConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, "");
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

async function upstashPipeline(commands: (string | number)[][]): Promise<Array<{ result: unknown }> | null> {
  const config = upstashConfig();
  if (!config) return null;
  const response = await fetch(`${config.url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`Upstash pipeline failed with status ${response.status}.`);
  return await response.json() as Array<{ result: unknown }>;
}

/** First X-Forwarded-For hop; on Vercel/most proxies this is the client IP. */
export function clientIpKey(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown-ip";
}

export function rateLimitKey(parts: Array<string | undefined | null>): string {
  return parts.filter((part): part is string => Boolean(part)).join(":");
}

function consumeMemory(bucketKey: string, windowMs: number, maxRequests: number, now: number): RateLimitDecision {
  const current = memoryBuckets.get(bucketKey);
  if (current === undefined || current.resetAt <= now) {
    memoryBuckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0, limit: maxRequests, remaining: maxRequests - 1 };
  }
  if (current.count >= maxRequests) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
      limit: maxRequests,
      remaining: 0
    };
  }
  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0, limit: maxRequests, remaining: maxRequests - current.count };
}

export async function consumeRateLimit(
  scope: RateLimitScope,
  identifier: string,
  now = Date.now()
): Promise<RateLimitDecision> {
  const { windowMs, maxRequests } = SCOPE_LIMITS[scope];
  const bucketKey = `ratelimit:${scope}:${identifier}`;
  if (!upstashConfig()) return consumeMemory(bucketKey, windowMs, maxRequests, now);

  try {
    const results = await upstashPipeline([
      ["INCR", bucketKey],
      ["PEXPIRE", bucketKey, windowMs, "NX"],
      ["PTTL", bucketKey]
    ]);
    if (!results) return consumeMemory(bucketKey, windowMs, maxRequests, now);
    const count = Number(results[0]?.result ?? 0);
    const ttlMs = Number(results[2]?.result ?? windowMs);
    if (count > maxRequests) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((ttlMs > 0 ? ttlMs : windowMs) / 1000)),
        limit: maxRequests,
        remaining: 0
      };
    }
    return { allowed: true, retryAfterSeconds: 0, limit: maxRequests, remaining: Math.max(0, maxRequests - count) };
  } catch (error) {
    logEvent("warn", "rate_limit.redis_unavailable", {
      scope,
      message: error instanceof Error ? error.message : "unknown"
    });
    return { allowed: true, retryAfterSeconds: 0, limit: maxRequests, remaining: maxRequests };
  }
}

/** 429 response with a Retry-After header. */
export function rateLimitedResponse(decision: RateLimitDecision, message = "Too many requests. Please retry later."): Response {
  return Response.json(
    { error: message, retryAfterSeconds: decision.retryAfterSeconds },
    { status: 429, headers: { "Retry-After": String(decision.retryAfterSeconds) } }
  );
}

/**
 * Concurrency guard for expensive jobs (e.g. validation runs). At most one slot
 * per key; the slot auto-expires after ttlMs so a crashed worker cannot wedge
 * the project forever.
 */
export async function acquireJobSlot(
  key: string,
  ttlMs = 120_000,
  now = Date.now()
): Promise<{ acquired: boolean; retryAfterSeconds: number }> {
  const slotKey = `jobslot:${key}`;
  if (!upstashConfig()) {
    const existing = memoryJobSlots.get(slotKey);
    if (existing !== undefined && existing > now) {
      return { acquired: false, retryAfterSeconds: Math.max(1, Math.ceil((existing - now) / 1000)) };
    }
    memoryJobSlots.set(slotKey, now + ttlMs);
    return { acquired: true, retryAfterSeconds: 0 };
  }
  try {
    const results = await upstashPipeline([["SET", slotKey, "1", "NX", "PX", ttlMs], ["PTTL", slotKey]]);
    if (!results) return { acquired: true, retryAfterSeconds: 0 };
    if (results[0]?.result === "OK") return { acquired: true, retryAfterSeconds: 0 };
    const ttl = Number(results[1]?.result ?? ttlMs);
    return { acquired: false, retryAfterSeconds: Math.max(1, Math.ceil((ttl > 0 ? ttl : ttlMs) / 1000)) };
  } catch (error) {
    logEvent("warn", "rate_limit.redis_unavailable", {
      scope: "jobslot",
      message: error instanceof Error ? error.message : "unknown"
    });
    return { acquired: true, retryAfterSeconds: 0 };
  }
}

export async function releaseJobSlot(key: string): Promise<void> {
  const slotKey = `jobslot:${key}`;
  if (!upstashConfig()) {
    memoryJobSlots.delete(slotKey);
    return;
  }
  try {
    await upstashPipeline([["DEL", slotKey]]);
  } catch {
    // Slot expires through its TTL; a failed release is not fatal.
  }
}

export function resetRateLimitForTests(): void {
  memoryBuckets.clear();
  memoryJobSlots.clear();
}
