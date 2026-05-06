import { ADAS_SYSTEM_PROMPT } from "@/ai/adasSystemPrompt";
import { buildAdasPrompt } from "@/ai/buildAdasPrompt";
import { buildFallbackAnswer } from "@/ai/fallbackAnswer";
import type { AdasChatRequest, AdasChatResponse } from "@/ai/types";

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

type ProviderSelection =
  | { provider: "gemini"; apiKey: string; model: string }
  | { provider: "openai"; apiKey: string; model: string }
  | { provider: "deterministic" };

interface ProviderEnv {
  GOOGLE_GENERATIVE_AI_API_KEY?: string;
  GOOGLE_GENERATION_MODEL?: string;
  OPENAI_API_KEY?: string;
}

export function selectAiProvider(env: ProviderEnv): ProviderSelection {
  const googleKey = env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  if (googleKey !== undefined && googleKey.length > 0) {
    const model = env.GOOGLE_GENERATION_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
    return {
      provider: "gemini",
      apiKey: googleKey,
      model
    };
  }

  const openAiKey = env.OPENAI_API_KEY?.trim();
  if (openAiKey !== undefined && openAiKey.length > 0) {
    return {
      provider: "openai",
      apiKey: openAiKey,
      model: DEFAULT_OPENAI_MODEL
    };
  }

  return { provider: "deterministic" };
}

export async function getAdasChatAnswer(input: AdasChatRequest): Promise<AdasChatResponse> {
  const selection = selectAiProvider({
    GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    GOOGLE_GENERATION_MODEL: process.env.GOOGLE_GENERATION_MODEL,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY
  });

  if (selection.provider === "deterministic") {
    return {
      answer: buildFallbackAnswer(input),
      metadata: { mode: "fallback", provider: "deterministic" }
    };
  }

  const userPrompt = buildAdasPrompt(input);

  try {
    if (selection.provider === "gemini") {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          selection.model
        )}:generateContent?key=${encodeURIComponent(selection.apiKey)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: ADAS_SYSTEM_PROMPT }]
            },
            generationConfig: {
              temperature: 0.1
            },
            contents: [
              {
                role: "user",
                parts: [{ text: userPrompt }]
              }
            ]
          })
        }
      );

      if (!response.ok) {
        return {
          answer: buildFallbackAnswer(input),
          metadata: { mode: "fallback", provider: "deterministic" }
        };
      }

      const data = (await response.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };
      const parts = data.candidates?.[0]?.content?.parts ?? [];
      const content = parts
        .map((part) => part.text ?? "")
        .join("")
        .trim();

      if (content.length === 0) {
        return {
          answer: buildFallbackAnswer(input),
          metadata: { mode: "fallback", provider: "deterministic" }
        };
      }

      return {
        answer: content,
        metadata: { mode: "ai", provider: "gemini", model: selection.model }
      };
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${selection.apiKey}`
      },
      body: JSON.stringify({
        model: selection.model,
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
        metadata: { mode: "fallback", provider: "deterministic" }
      };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content?.trim();

    if (content === undefined || content.length === 0) {
      return {
        answer: buildFallbackAnswer(input),
        metadata: { mode: "fallback", provider: "deterministic" }
      };
    }

    return {
      answer: content,
      metadata: { mode: "ai", provider: "openai", model: selection.model }
    };
  } catch {
    return {
      answer: buildFallbackAnswer(input),
      metadata: { mode: "fallback", provider: "deterministic" }
    };
  }
}
