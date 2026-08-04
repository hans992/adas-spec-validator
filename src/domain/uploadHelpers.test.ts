import { describe, expect, it } from "vitest";
import { sampleModelData, sampleRequirements } from "@/domain/sampleData";
import {
  parseUploadedJson,
  validateUploadedModel,
  validateUploadedRequirements,
  validateUploadedSpecification
} from "@/domain/uploadHelpers";
import { validateWithDeterministicRules } from "@/domain/validationPipeline";

describe("upload helpers", () => {
  it("parses valid JSON", () => {
    const result = parseUploadedJson(JSON.stringify(sampleModelData));
    expect(result.success).toBe(true);
  });

  it("returns error for invalid JSON", () => {
    const result = parseUploadedJson("{ this is not json");
    expect(result.success).toBe(false);
  });

  it("validates uploaded model shape", () => {
    const result = validateUploadedModel(sampleModelData);
    expect(result.success).toBe(true);
  });

  it("returns schema error for invalid requirements shape", () => {
    const result = validateUploadedRequirements([{ foo: "bar" }]);
    expect(result.success).toBe(false);
  });

  it("validation pipeline works with uploaded-shaped data", () => {
    const result = validateWithDeterministicRules(sampleModelData, sampleRequirements);
    expect(result.results.length).toBeGreaterThan(0);
  });

  it("rejects duplicate element ids across collections", () => {
    const result = validateUploadedModel({
      levels: [{ id: "shared", name: "Level" }],
      rooms: [{ id: "shared", name: "Room", levelId: "shared", roomType: "office" }],
      doors: []
    });
    expect(result.success).toBe(false);
  });

  it("rejects unresolved and one-sided relationships", () => {
    const unresolved = validateUploadedModel({
      levels: [{ id: "level-1", name: "Level" }],
      rooms: [{ id: "room-1", name: "Room", levelId: "level-1", roomType: "office", connectedDoorIds: ["missing"] }],
      doors: []
    });
    const oneSided = validateUploadedModel({
      levels: [{ id: "level-1", name: "Level" }],
      rooms: [{ id: "room-1", name: "Room", levelId: "level-1", roomType: "office", connectedDoorIds: ["door-1"] }],
      doors: [{ id: "door-1", name: "Door", levelId: "level-1", connectedRoomIds: [] }]
    });
    expect(unresolved.success).toBe(false);
    expect(oneSided.success).toBe(false);
  });
});

describe("validateUploadedSpecification", () => {
  it("accepts a versioned package and retains legacy array imports", () => {
    const requirement = {
      id: "ADAS-001",
      title: "Rooms have doors",
      type: "room_has_connected_door",
      severity: "warning"
    };
    const packaged = validateUploadedSpecification({ name: "ADAS Spec", revision: "C", requirements: [requirement] });
    const legacy = validateUploadedSpecification([requirement]);

    expect(packaged.success && packaged.data.revision).toBe("C");
    expect(legacy.success && legacy.data.revision).toBe("Unspecified");
  });
});
