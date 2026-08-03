import { describe, expect, it } from "vitest";
import { parseAndVerifyProviderAnswer } from "@/ai/verifyProviderAnswer";
import type { TrustedAdasChatInput } from "@/ai/types";

const input: TrustedAdasChatInput = {
  userQuestion: "Does it comply?",
  selectedRole: "Design Engineer",
  normalizedModel: {
    levels: [{ id: "level-1", name: "Level 1" }],
    rooms: [{ id: "room-1", name: "Stockroom", levelId: "level-1", roomType: "stockroom", areaSqm: 8 }],
    doors: []
  },
  requirements: [{ id: "area-1", title: "Minimum area", type: "minimum_room_area", severity: "critical", roomType: "stockroom", minAreaSqm: 15 }],
  validationResults: [{
    ruleId: "MinimumRoomAreaRule",
    requirementId: "area-1",
    requirementTitle: "Minimum area",
    elementType: "room",
    status: "fail",
    severity: "critical",
    summary: "Room fails.",
    affectedElementIds: ["room-1"],
    evidence: [{ observed: 8, expected: 15, message: "Compared area." }]
  }]
};

describe("provider answer verifier", () => {
  it("accepts citations backed by deterministic results", () => {
    const answer = parseAndVerifyProviderAnswer(JSON.stringify({
      answer: "Room room-1 fails area-1.",
      citations: [{ requirementId: "area-1", elementIds: ["room-1"] }]
    }), input);
    expect(answer?.answer).toContain("fails");
  });

  it("rejects unknown requirement ids", () => {
    expect(parseAndVerifyProviderAnswer(JSON.stringify({
      answer: "Invented claim.",
      citations: [{ requirementId: "invented", elementIds: ["room-1"] }]
    }), input)).toBeNull();
  });

  it("rejects element ids not affected by the cited result", () => {
    expect(parseAndVerifyProviderAnswer(JSON.stringify({
      answer: "Invented element.",
      citations: [{ requirementId: "area-1", elementIds: ["room-999"] }]
    }), input)).toBeNull();
  });

  it("rejects malformed provider output", () => {
    expect(parseAndVerifyProviderAnswer("not json", input)).toBeNull();
  });
});
