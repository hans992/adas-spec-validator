import { NextResponse } from "next/server";
import { z } from "zod";
import { getAecChatAnswer } from "@/ai/aiClient";
import { aecChatRequestSchema } from "@/ai/types";
import { runDeterministicValidation } from "@/domain/ruleEngine";
import { createRequestLog, metricEvent } from "@/observability/logger";
import { clientIpKey, consumeRateLimit, rateLimitedResponse } from "@/security/rateLimit";

const MAX_CHAT_BODY_BYTES = 1_000_000;

export async function POST(request: Request) {
  const log = createRequestLog("/api/chat");
  try {
    const rateLimit = await consumeRateLimit("chat", clientIpKey(request));
    if (!rateLimit.allowed) {
      return rateLimitedResponse(rateLimit, "Too many chat requests. Please try again shortly.");
    }

    const declaredLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_CHAT_BODY_BYTES) {
      return NextResponse.json({ error: "Chat request payload is too large." }, { status: 413 });
    }

    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > MAX_CHAT_BODY_BYTES) {
      return NextResponse.json({ error: "Chat request payload is too large." }, { status: 413 });
    }

    const payload: unknown = JSON.parse(body);
    const parsedPayload = aecChatRequestSchema.parse(payload);
    const validationResults = runDeterministicValidation(
      parsedPayload.normalizedModel,
      parsedPayload.requirements
    );
    const result = await getAecChatAnswer({ ...parsedPayload, validationResults });

    metricEvent("chat_answer", {
      requestId: log.requestId,
      mode: result.metadata.mode,
      provider: result.metadata.provider,
      durationMs: Date.now() - log.startedAt
    });
    log.finish({ status: 200 });
    return NextResponse.json(result, { headers: { "X-Request-Id": log.requestId } });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json(
        {
          error: "Invalid chat request payload.",
          details: error instanceof z.ZodError ? error.issues : undefined
        },
        { status: 400 }
      );
    }

    log.fail(error);
    return NextResponse.json(
      {
        error: "Unexpected chat route error."
      },
      { status: 500 }
    );
  }
}
