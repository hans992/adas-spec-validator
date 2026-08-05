import { NextResponse } from "next/server";
import { z } from "zod";
import { getAecChatAnswer } from "@/ai/aiClient";
import { aecChatRequestSchema } from "@/ai/types";
import { runDeterministicValidation } from "@/domain/ruleEngine";
import { consumeChatRateLimit } from "@/ai/chatRateLimit";

const MAX_CHAT_BODY_BYTES = 1_000_000;

export async function POST(request: Request) {
  try {
    const clientKey = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anonymous";
    const rateLimit = consumeChatRateLimit(clientKey);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many chat requests. Please try again shortly." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
      );
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

    return NextResponse.json(result);
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

    return NextResponse.json(
      {
        error: "Unexpected chat route error."
      },
      { status: 500 }
    );
  }
}
