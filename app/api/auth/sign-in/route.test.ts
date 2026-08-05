import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetRateLimitForTests } from "@/security/rateLimit";
import { POST } from "./route";

const request = (body: unknown, ip = "203.0.113.10") => new Request("http://localhost/api/auth/sign-in", {
  method: "POST",
  headers: { "content-type": "application/json", "x-forwarded-for": ip },
  body: JSON.stringify(body)
});

describe("sign-in proxy with brute-force protection", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    resetRateLimitForTests();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("forwards valid credentials to Supabase Auth and returns the session", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json({ access_token: "a", refresh_token: "r", expires_in: 3600 })
    );
    const response = await POST(request({ email: "User@Example.com", password: "correct horse" }));
    expect(response.status).toBe(200);
    expect((await response.json()).access_token).toBe("a");
    expect(String(fetchMock.mock.calls[0][0])).toContain("grant_type=password");
    const forwarded = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(forwarded.email).toBe("user@example.com");
  });

  it("maps failed credentials to a uniform 401", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json({ error: "invalid_grant", error_description: "leaky detail" }, { status: 400 })
    );
    const response = await POST(request({ email: "user@example.com", password: "wrong" }));
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain("leaky");
  });

  it("rate limits repeated attempts per account with Retry-After", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({}, { status: 400 }));
    for (let i = 0; i < 10; i += 1) {
      await POST(request({ email: "victim@example.com", password: `guess-${i}` }, `198.51.100.${i}`));
    }
    const blocked = await POST(request({ email: "victim@example.com", password: "guess-11" }, "198.51.100.99"));
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("rate limits by client IP across different accounts", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({}, { status: 400 }));
    for (let i = 0; i < 10; i += 1) {
      await POST(request({ email: `spray-${i}@example.com`, password: "guess" }, "192.0.2.7"));
    }
    const blocked = await POST(request({ email: "spray-11@example.com", password: "guess" }, "192.0.2.7"));
    expect(blocked.status).toBe(429);
  });

  it("rejects malformed payloads without hitting Supabase", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await POST(request({ email: "not-an-email", password: "" }));
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
