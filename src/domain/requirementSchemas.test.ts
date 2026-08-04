import { describe, expect, it } from "vitest";
import { requirementSchema, requirementsSchema, specificationPackageSchema } from "@/domain/schemas";

describe("requirementSchema", () => {
  it("accepts valid ranges and door quantifiers", () => {
    expect(requirementSchema.safeParse({
      id: "req-1",
      title: "Any connected door within range",
      type: "minimum_door_width_for_room_type",
      severity: "warning",
      roomType: "office",
      minDoorWidthM: 0.85,
      maxDoorWidthM: 1.2,
      quantifier: "any"
    }).success).toBe(true);
  });

  it("preserves a traceable source reference", () => {
    const result = requirementSchema.safeParse({
      id: "ADAS-DOOR-0042",
      title: "Office doors meet the clear-width specification",
      type: "minimum_door_width_for_room_type",
      severity: "critical",
      roomType: "office",
      minDoorWidthM: 0.85,
      source: { document: "ADAS Building Specification", section: "4.2.1", revision: "C" }
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.source?.section).toBe("4.2.1");
  });

  it("rejects duplicate IDs across a specification package", () => {
    const requirement = {
      id: "ADAS-001",
      title: "Every room has a connected door",
      type: "room_has_connected_door" as const,
      severity: "warning" as const
    };
    expect(requirementsSchema.safeParse([requirement, requirement]).success).toBe(false);
    expect(specificationPackageSchema.safeParse({
      name: "ADAS Building Specification",
      revision: "C",
      requirements: [requirement]
    }).success).toBe(true);
  });

  it("rejects inverted room and door ranges", () => {
    const room = requirementSchema.safeParse({
      id: "req-room",
      title: "Invalid room range",
      type: "minimum_room_area",
      severity: "warning",
      roomType: "office",
      minAreaSqm: 12,
      maxAreaSqm: 8
    });
    const door = requirementSchema.safeParse({
      id: "req-door",
      title: "Invalid door range",
      type: "minimum_door_width_for_room_type",
      severity: "warning",
      roomType: "office",
      minDoorWidthM: 1.2,
      maxDoorWidthM: 0.8,
      quantifier: "all"
    });

    expect(room.success).toBe(false);
    expect(door.success).toBe(false);
  });

  it("accepts a composite rule with two valid conditions", () => {
    const result = requirementSchema.safeParse({
      id: "req-composite",
      title: "Office area and door width",
      type: "composite_room_rule",
      severity: "critical",
      roomType: "office",
      operator: "and",
      conditions: [
        { type: "room_area_range", minAreaSqm: 10, maxAreaSqm: 20 },
        {
          type: "connected_door_width_range",
          minDoorWidthM: 0.85,
          maxDoorWidthM: 1.2,
          quantifier: "any"
        }
      ]
    });

    expect(result.success).toBe(true);
  });

  it("rejects composites with fewer than two conditions or an inverted branch range", () => {
    const oneCondition = requirementSchema.safeParse({
      id: "req-too-small",
      title: "Incomplete composite",
      type: "composite_room_rule",
      severity: "warning",
      roomType: "office",
      operator: "or",
      conditions: [{ type: "room_area_range", minAreaSqm: 10 }]
    });
    const invertedCondition = requirementSchema.safeParse({
      id: "req-inverted-condition",
      title: "Invalid composite range",
      type: "composite_room_rule",
      severity: "warning",
      roomType: "office",
      operator: "and",
      conditions: [
        { type: "room_area_range", minAreaSqm: 20, maxAreaSqm: 10 },
        { type: "connected_door_width_range", minDoorWidthM: 0.85 }
      ]
    });

    expect(oneCondition.success).toBe(false);
    expect(invertedCondition.success).toBe(false);
  });
});
