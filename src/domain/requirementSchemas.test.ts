import { describe, expect, it } from "vitest";
import { requirementSchema } from "@/domain/schemas";

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
});
