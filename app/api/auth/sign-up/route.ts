import { createHash } from "node:crypto";

import { z } from "zod";

import { auditEvent, createRequestLog } from "@/observability/logger";
import { clientIpKey, consumeRateLimit, rateLimitedResponse } from "@/security/rateLimit";

export const runtime = "nodejs";

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(8).max(1024)
}).strict();

function authConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

/** Sign-up proxy with shared per-IP throttling to stop automated account farming. */
export async function POST(request: Request) {
  const log = createRequestLog("/api/auth/sign-up");
  try {
    const config = authConfig();
    if (!config) return Response.json({ error: "Authentication is not configured." }, { status: 503 });

    const input = credentialsSchema.parse(await request.json());
    const ip = clientIpKey(request);
    const decision = await consumeRateLimit("auth", `signup:ip:${ip}`);
    if (!decision.allowed) {
      auditEvent("auth.sign_up", { requestId: log.requestId, outcome: "denied", detail: "rate_limited" });
      return rateLimitedResponse(decision, "Too many sign-up attempts. Please try again later.");
    }

    const response = await fetch(`${config.url}/auth/v1/signup`, {
      method: "POST",
      headers: { apikey: config.anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email: input.email, password: input.password }),
      cache: "no-store"
    });

    const account = createHash("sha256").update(input.email).digest("hex").slice(0, 24);
    if (!response.ok) {
      auditEvent("auth.sign_up", { requestId: log.requestId, targetId: account, outcome: "failure" });
      log.finish({ status: 400 });
      return Response.json({ error: "Account could not be created." }, { status: 400 });
    }

    auditEvent("auth.sign_up", { requestId: log.requestId, targetId: account, outcome: "success" });
    log.finish({ status: 200 });
    return Response.json(await response.json(), { headers: { "X-Request-Id": log.requestId } });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof z.ZodError) {
      return Response.json({ error: "Invalid sign-up payload. Passwords need at least 8 characters." }, { status: 400 });
    }
    log.fail(error);
    return Response.json({ error: "Sign-up failed." }, { status: 500 });
  }
}
