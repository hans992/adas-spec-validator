import { describe, expect, it } from "vitest";
import { ADAS_SYSTEM_PROMPT } from "@/ai/adasSystemPrompt";
import { buildAdasPrompt } from "@/ai/buildAdasPrompt";
import { buildFallbackAnswer } from "@/ai/fallbackAnswer";
import type { AdasChatRequest } from "@/ai/types";

const requestFixture: AdasChatRequest = {
  userQuestion: "Does room rm-stock-02 comply?",
  selectedRole: "Design Engineer",
  normalizedModel: {
    levels: [{ id: "lvl-01", name: "Level 01" }],
    rooms: [
      {
        id: "rm-stock-02",
        name: "Stockroom B",
        levelId: "lvl-01",
        roomType: "stockroom"
      }
    ],
    doors: []
  },
  validationResults: [
    {
      ruleId: "MinimumRoomAreaRule",
      requirementId: "req-stockroom-min-area",
      requirementTitle: "Stockrooms must be at least 15 sqm",
      elementType: "room",
      status: "unknown",
      severity: "critical",
      summary: "Cannot verify area for Stockroom B; area is missing.",
      affectedElementIds: ["rm-stock-02"],
      evidence: [
        {
          message: "Area parameter is not available in normalized model data.",
          field: "room.areaSqm",
          observed: null,
          expected: ">= 15"
        }
      ]
    }
  ]
};

describe("ADAS prompt and fallback", () => {
  it("includes selected role in prompt", () => {
    const prompt = buildAdasPrompt(requestFixture);
    expect(prompt).toContain("Selected role: Design Engineer");
  });

  it("includes anti-hallucination instruction", () => {
    expect(ADAS_SYSTEM_PROMPT).toContain("Do not infer missing CAD/BIM data.");
    expect(ADAS_SYSTEM_PROMPT).toContain(
      '"I cannot determine that from the available model evidence."'
    );
  });

  it("includes validation evidence in prompt", () => {
    const prompt = buildAdasPrompt(requestFixture);
    expect(prompt).toContain("Area parameter is not available in normalized model data.");
  });

  it("includes element ids in prompt context", () => {
    const prompt = buildAdasPrompt(requestFixture);
    expect(prompt).toContain("rm-stock-02");
  });

  it("fallback mentions unknowns", () => {
    const answer = buildFallbackAnswer(requestFixture);
    expect(answer).toContain("unknown");
    expect(answer).toContain("remain unknown");
  });

  it("fallback does not convert unknowns into pass/fail", () => {
    const answer = buildFallbackAnswer(requestFixture);
    expect(answer).toContain("1 unknown");
    expect(answer).not.toContain("0 unknown");
  });
});
