import { describe, expect, it } from "vitest";
import { selectAiProvider } from "@/ai/aiClient";

describe("selectAiProvider", () => {
  it("selects Gemini when GOOGLE_GENERATIVE_AI_API_KEY exists", () => {
    const provider = selectAiProvider({
      GOOGLE_GENERATIVE_AI_API_KEY: "google-key",
      GOOGLE_GENERATION_MODEL: "gemini-2.5-flash"
    });

    expect(provider.provider).toBe("gemini");
    if (provider.provider === "gemini") {
      expect(provider.model).toBe("gemini-2.5-flash");
    }
  });

  it("selects OpenAI when only OPENAI_API_KEY exists", () => {
    const provider = selectAiProvider({
      OPENAI_API_KEY: "openai-key"
    });

    expect(provider.provider).toBe("openai");
  });

  it("selects fallback when neither provider key exists", () => {
    const provider = selectAiProvider({});
    expect(provider.provider).toBe("deterministic");
  });
});
