import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  acquireJobSlot,
  clientIpKey,
  consumeRateLimit,
  rateLimitKey,
  rateLimitedResponse,
  releaseJobSlot,
  resetRateLimitForTests
} from "@/security/rateLimit";

describe("shared rate limiting", () => {
  beforeEach(() => resetRateLimitForTests());
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("keeps scopes independent and enforces per-scope caps in memory", async () => {
    for (let i = 0; i < 6; i += 1) {
      expect((await consumeRateLimit("validation", "project-1")).allowed).toBe(true);
    }
    const blocked = await consumeRateLimit("validation", "project-1");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    // The chat scope for the same identifier is unaffected.
    expect((await consumeRateLimit("chat", "project-1")).allowed).toBe(true);
    // A different identifier in the same scope is unaffected.
    expect((await consumeRateLimit("validation", "project-2")).allowed).toBe(true);
  });

  it("resets after the window expires", async () => {
    const start = 1_000_000;
    for (let i = 0; i < 10; i += 1) await consumeRateLimit("auth", "1.2.3.4", start);
    expect((await consumeRateLimit("auth", "1.2.3.4", start)).allowed).toBe(false);
    expect((await consumeRateLimit("auth", "1.2.3.4", start + 15 * 60_000 + 1)).allowed).toBe(true);
  });

  it("produces a 429 with Retry-After", async () => {
    const response = rateLimitedResponse({ allowed: false, retryAfterSeconds: 42, limit: 10, remaining: 0 });
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("42");
    expect((await response.json()).retryAfterSeconds).toBe(42);
  });

  it("uses shared Redis when Upstash is configured and denies past the cap", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json([{ result: 21 }, { result: 0 }, { result: 30_000 }])
    );
    const decision = await consumeRateLimit("chat", "user-1");
    expect(decision.allowed).toBe(false);
    expect(decision.retryAfterSeconds).toBe(30);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://redis.example.upstash.io/pipeline");
    const commands = JSON.parse(String((init as RequestInit).body));
    expect(commands[0]).toEqual(["INCR", "ratelimit:chat:user-1"]);
  });

  it("fails open when Redis is unreachable", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token");
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("connect timeout"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const decision = await consumeRateLimit("upload", "1.2.3.4");
    expect(decision.allowed).toBe(true);
  });

  it("guards expensive jobs with a single slot per key", async () => {
    const first = await acquireJobSlot("validation:project-1", 60_000, 0);
    expect(first.acquired).toBe(true);
    const second = await acquireJobSlot("validation:project-1", 60_000, 1);
    expect(second.acquired).toBe(false);
    expect(second.retryAfterSeconds).toBeGreaterThan(0);
    await releaseJobSlot("validation:project-1");
    expect((await acquireJobSlot("validation:project-1", 60_000, 2)).acquired).toBe(true);
  });

  it("builds keys from client IP and identity parts", () => {
    const request = new Request("http://localhost", { headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" } });
    expect(clientIpKey(request)).toBe("203.0.113.9");
    expect(clientIpKey(new Request("http://localhost"))).toBe("unknown-ip");
    expect(rateLimitKey(["user-1", undefined, "project-2"])).toBe("user-1:project-2");
  });
});
