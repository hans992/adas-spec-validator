import { describe, expect, it } from "vitest";
import { runDeterministicValidation } from "@/domain/ruleEngine";
import type { NormalizedModel, Requirement } from "@/domain/types";

const baseModel: NormalizedModel = {
  levels: [{ id: "lvl-1", name: "Level 1" }],
  rooms: [
    {
      id: "room-stock-pass",
      name: "Stock Pass",
      levelId: "lvl-1",
      roomType: "stockroom",
      areaSqm: 20,
      connectedDoorIds: ["door-pass"]
    },
    {
      id: "room-office-fail",
      name: "Office Fail",
      levelId: "lvl-1",
      roomType: "office",
      areaSqm: 6,
      connectedDoorIds: ["door-office"]
    },
    {
      id: "room-stock-unknown-area",
      name: "Stock Unknown Area",
      levelId: "lvl-1",
      roomType: "stockroom",
      connectedDoorIds: ["door-pass"]
    }
  ],
  doors: [
    {
      id: "door-pass",
      name: "Door Pass",
      levelId: "lvl-1",
      widthM: 0.9,
      connectedRoomIds: ["room-stock-pass"]
    },
    {
      id: "door-office",
      name: "Door Office",
      levelId: "lvl-1",
      widthM: 0.8,
      connectedRoomIds: ["room-office-fail"]
    }
  ]
};

describe("runDeterministicValidation", () => {
  it("returns pass for rooms that satisfy minimum area", () => {
    const requirements: Requirement[] = [
      {
        id: "req-1",
        title: "Stockrooms must be at least 15 sqm",
        type: "minimum_room_area",
        severity: "critical",
        roomType: "stockroom",
        minAreaSqm: 15
      }
    ];

    const results = runDeterministicValidation(baseModel, requirements);
    const pass = results.find((result) => result.affectedElementIds.includes("room-stock-pass"));

    expect(pass?.status).toBe("pass");
  });

  it("returns fail for rooms that violate minimum area", () => {
    const requirements: Requirement[] = [
      {
        id: "req-2",
        title: "Offices must be at least 8 sqm",
        type: "minimum_room_area",
        severity: "critical",
        roomType: "office",
        minAreaSqm: 8
      }
    ];

    const [result] = runDeterministicValidation(baseModel, requirements);
    expect(result.status).toBe("fail");
    expect(result.summary).toContain("< 8");
  });

  it("returns unknown when room area is missing", () => {
    const requirements: Requirement[] = [
      {
        id: "req-3",
        title: "Stockrooms must be at least 15 sqm",
        type: "minimum_room_area",
        severity: "critical",
        roomType: "stockroom",
        minAreaSqm: 15
      }
    ];

    const results = runDeterministicValidation(baseModel, requirements);
    const unknown = results.find((result) =>
      result.affectedElementIds.includes("room-stock-unknown-area")
    );

    expect(unknown?.status).toBe("unknown");
  });

  it("returns fail when connected door width is below requirement", () => {
    const requirements: Requirement[] = [
      {
        id: "req-4",
        title: "Offices door width",
        type: "minimum_door_width_for_room_type",
        severity: "warning",
        roomType: "office",
        minDoorWidthM: 0.85
      }
    ];

    const [result] = runDeterministicValidation(baseModel, requirements);
    expect(result.status).toBe("fail");
    expect(result.evidence[0].observed).toContain("door-office:0.8");
  });

  it("returns unknown when required relationship data is missing", () => {
    const model: NormalizedModel = {
      ...baseModel,
      rooms: [
        {
          id: "room-stock-missing-rel",
          name: "Stock Missing Relationship",
          levelId: "lvl-1",
          roomType: "stockroom",
          areaSqm: 16
        }
      ]
    };

    const requirements: Requirement[] = [
      {
        id: "req-5",
        title: "Stockroom doors must be at least 0.85m wide",
        type: "minimum_door_width_for_room_type",
        severity: "warning",
        roomType: "stockroom",
        minDoorWidthM: 0.85
      }
    ];

    const [result] = runDeterministicValidation(model, requirements);
    expect(result.status).toBe("unknown");
  });

  it("includes evidence in every validation result", () => {
    const requirements: Requirement[] = [
      {
        id: "req-6",
        title: "Every room must have at least one connected door",
        type: "room_has_connected_door",
        severity: "warning"
      }
    ];

    const results = runDeterministicValidation(baseModel, requirements);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((result) => result.evidence.length > 0)).toBe(true);
  });

  it("does not infer missing values for door widths", () => {
    const model: NormalizedModel = {
      ...baseModel,
      doors: [
        {
          id: "door-pass",
          name: "Door Pass",
          levelId: "lvl-1",
          connectedRoomIds: ["room-stock-pass"]
        }
      ],
      rooms: [
        {
          id: "room-stock-pass",
          name: "Stock Pass",
          levelId: "lvl-1",
          roomType: "stockroom",
          areaSqm: 20,
          connectedDoorIds: ["door-pass"]
        }
      ]
    };
    const requirements: Requirement[] = [
      {
        id: "req-7",
        title: "Stockroom doors must be at least 0.85m wide",
        type: "minimum_door_width_for_room_type",
        severity: "warning",
        roomType: "stockroom",
        minDoorWidthM: 0.85
      }
    ];

    const [result] = runDeterministicValidation(model, requirements);
    expect(result.status).toBe("unknown");
    expect(result.summary).toContain("missing width");
  });
});
