import { ADAS_SYSTEM_PROMPT } from "@/ai/adasSystemPrompt";
import { buildAdasPrompt } from "@/ai/buildAdasPrompt";
import { buildFallbackAnswer } from "@/ai/fallbackAnswer";
import type { AdasChatRequest, AdasChatResponse } from "@/ai/types";

export async function getAdasChatAnswer(input: AdasChatRequest): Promise<AdasChatResponse> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (apiKey === undefined || apiKey.trim().length === 0) {
    return {
      answer: buildFallbackAnswer(input),
      metadata: { mode: "fallback" }
    };
  }

  const userPrompt = buildAdasPrompt(input);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.1,
        messages: [
          { role: "system", content: ADAS_SYSTEM_PROMPT },
          { role: "user", content: userPrompt }
        ]
      })
    });

    if (!response.ok) {
      return {
        answer: buildFallbackAnswer(input),
        metadata: { mode: "fallback" }
      };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content?.trim();

    if (content === undefined || content.length === 0) {
      return {
        answer: buildFallbackAnswer(input),
        metadata: { mode: "fallback" }
      };
    }

    return {
      answer: content,
      metadata: { mode: "ai" }
    };
  } catch {
    return {
      answer: buildFallbackAnswer(input),
      metadata: { mode: "fallback" }
    };
  }
}
