import { createHash } from "node:crypto";

import { z } from "zod";

import { auditEvent, createRequestLog } from "@/observability/logger";
import { clientIpKey, consumeRateLimit, rateLimitedResponse } from "@/security/rateLimit";

export const runtime = "nodejs";

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(1).max(1024)
}).strict();

function emailKey(email: string): string {
  return createHash("sha256").update(email).digest("hex").slice(0, 24);
}

function authConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

/**
 * Server-side sign-in proxy. Adds shared brute-force throttling per client IP
 * and per target account before the request ever reaches Supabase Auth, and
 * emits audit events without credentials or raw email addresses.
 */
export async function POST(request: Request) {
  const log = createRequestLog("/api/auth/sign-in");
  try {
    const config = authConfig();
    if (!config) return Response.json({ error: "Authentication is not configured." }, { status: 503 });

    const input = credentialsSchema.parse(await request.json());
    const ip = clientIpKey(request);
    const account = emailKey(input.email);

    const [byIp, byAccount] = await Promise.all([
      consumeRateLimit("auth", `signin:ip:${ip}`),
      consumeRateLimit("auth", `signin:account:${account}`)
    ]);
    if (!byIp.allowed || !byAccount.allowed) {
      const decision = byIp.allowed ? byAccount : byIp;
      auditEvent("auth.sign_in", { requestId: log.requestId, targetId: account, outcome: "denied", detail: "rate_limited" });
      return rateLimitedResponse(decision, "Too many sign-in attempts. Please try again later.");
    }

    const response = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: config.anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email: input.email, password: input.password }),
      cache: "no-store"
    });

    if (!response.ok) {
      auditEvent("auth.sign_in", { requestId: log.requestId, targetId: account, outcome: "failure" });
      log.finish({ status: 401 });
      return Response.json({ error: "Email or password is incorrect." }, { status: 401 });
    }

    auditEvent("auth.sign_in", { requestId: log.requestId, targetId: account, outcome: "success" });
    log.finish({ status: 200 });
    return Response.json(await response.json(), { headers: { "X-Request-Id": log.requestId } });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof z.ZodError) {
      return Response.json({ error: "Invalid sign-in payload." }, { status: 400 });
    }
    log.fail(error);
    return Response.json({ error: "Sign-in failed." }, { status: 500 });
  }
}
