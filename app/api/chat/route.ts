import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdasChatAnswer } from "@/ai/aiClient";
import { adasChatRequestSchema } from "@/ai/types";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const parsedPayload = adasChatRequestSchema.parse(payload);
    const result = await getAdasChatAnswer(parsedPayload);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid chat request payload.",
          details: error.issues
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
