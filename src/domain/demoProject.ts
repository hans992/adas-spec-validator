/**
 * Seed content for the guided demo project.
 *
 * Intentionally produces a mixed outcome set so onboarding can show:
 * - several passing requirements
 * - several failures
 * - at least one unknown (textual clause awaiting rule configuration)
 * - a waived finding on the baseline run
 * - two specification revisions + two validation runs for regression
 *
 * The model topology mirrors a small office IFC (spaces + doors) without
 * requiring a live IFC parse during seed.
 */
import type { NormalizedModel, Requirement, SpecificationPackage, ValidationResult } from "@/domain/types";
import { calculateComplianceMetrics } from "@/domain/complianceMetrics";
import { validateWithDeterministicRules } from "@/domain/validationPipeline";

export const DEMO_PROJECT_NAME = "Demo — Riverside Office";
export const DEMO_PROJECT_DESCRIPTION =
  "Guided sample with a realistic office model, a building specification, mixed findings, one waived decision, and two revisions for regression.";

/** Normalized model derived from a typical single-storey office IFC. */
export const demoModel: NormalizedModel = {
  levels: [{ id: "lvl-gf", name: "Ground Floor" }],
  rooms: [
    {
      id: "rm-stock-a",
      name: "Stockroom A",
      levelId: "lvl-gf",
      roomType: "stockroom",
      areaSqm: 18.4,
      connectedDoorIds: ["dr-stock-a", "dr-stock-a-egress"]
    },
    {
      id: "rm-stock-b",
      name: "Stockroom B",
      levelId: "lvl-gf",
      roomType: "stockroom",
      areaSqm: 11.2,
      connectedDoorIds: []
    },
    {
      id: "rm-office-101",
      name: "Office 101",
      levelId: "lvl-gf",
      roomType: "office",
      areaSqm: 12.5,
      connectedDoorIds: ["dr-office-101"]
    },
    {
      id: "rm-office-102",
      name: "Office 102",
      levelId: "lvl-gf",
      roomType: "office",
      areaSqm: 6.8,
      connectedDoorIds: ["dr-office-102"]
    },
    {
      id: "rm-meet-a",
      name: "Meeting Room A",
      levelId: "lvl-gf",
      roomType: "meeting_room",
      areaSqm: 22.0,
      connectedDoorIds: ["dr-meet-a"]
    },
    {
      id: "rm-corridor",
      name: "Main Corridor",
      levelId: "lvl-gf",
      roomType: "corridor",
      areaSqm: 28.0,
      connectedDoorIds: ["dr-stock-a", "dr-office-101", "dr-office-102", "dr-meet-a"]
    }
  ],
  doors: [
    {
      id: "dr-stock-a",
      name: "Door S-A",
      levelId: "lvl-gf",
      widthM: 0.92,
      connectedRoomIds: ["rm-stock-a", "rm-corridor"]
    },
    {
      id: "dr-stock-a-egress",
      name: "Door S-A Egress",
      levelId: "lvl-gf",
      widthM: 0.78,
      connectedRoomIds: ["rm-stock-a"]
    },
    {
      id: "dr-office-101",
      name: "Door O-101",
      levelId: "lvl-gf",
      widthM: 0.9,
      connectedRoomIds: ["rm-office-101", "rm-corridor"]
    },
    {
      id: "dr-office-102",
      name: "Door O-102",
      levelId: "lvl-gf",
      widthM: 0.82,
      connectedRoomIds: ["rm-office-102", "rm-corridor"]
    },
    {
      id: "dr-meet-a",
      name: "Door M-A",
      levelId: "lvl-gf",
      widthM: 0.95,
      connectedRoomIds: ["rm-meet-a", "rm-corridor"]
    }
  ]
};

const sharedSource = (section: string) => ({
  document: "Riverside Office — Architectural Specification",
  section,
  revision: "A"
});

/** Revision A — baseline specification. */
export const demoRequirementsA: Requirement[] = [
  {
    id: "req-stockroom-min-area",
    title: "Stockrooms must be at least 15 m²",
    type: "minimum_room_area",
    severity: "critical",
    roomType: "stockroom",
    minAreaSqm: 15,
    unit: "m²",
    quantityType: "area",
    source: sharedSource("3.2.1")
  },
  {
    id: "req-office-min-area",
    title: "Offices must be at least 8 m²",
    type: "minimum_room_area",
    severity: "critical",
    roomType: "office",
    minAreaSqm: 8,
    unit: "m²",
    quantityType: "area",
    source: sharedSource("3.1.4")
  },
  {
    id: "req-stockroom-door-width",
    title: "Stockroom doors must be at least 0.85 m clear width",
    type: "minimum_door_width_for_room_type",
    severity: "warning",
    roomType: "stockroom",
    minDoorWidthM: 0.85,
    unit: "m",
    quantityType: "length",
    source: sharedSource("4.1.2")
  },
  {
    id: "req-room-has-door",
    title: "Every room must have at least one connected door",
    type: "room_has_connected_door",
    severity: "warning",
    source: sharedSource("4.0.1")
  },
  {
    id: "req-corridor-pass",
    title: "Corridors are informational for escape-route coordination",
    type: "textual_requirement",
    severity: "info",
    automationStatus: "informational",
    source: sharedSource("5.1.0")
  },
  {
    id: "req-fire-rating-unknown",
    title: "Compartment walls shall achieve EI 90 fire resistance",
    type: "textual_requirement",
    severity: "critical",
    automationStatus: "requires_rule_configuration",
    source: sharedSource("6.2.3")
  }
];

/**
 * Revision B — tighter office area (8 → 10 m²) so regression shows a new /
 * worsened finding versus the baseline while keeping the rest comparable.
 */
export const demoRequirementsB: Requirement[] = demoRequirementsA.map((requirement) => {
  if (requirement.id === "req-office-min-area" && requirement.type === "minimum_room_area") {
    return {
      ...requirement,
      title: "Offices must be at least 10 m²",
      minAreaSqm: 10,
      source: { ...sharedSource("3.1.4"), revision: "B" }
    };
  }
  if (requirement.source) {
    return { ...requirement, source: { ...requirement.source, revision: "B" } };
  }
  return requirement;
});

export const demoSpecificationA: SpecificationPackage = {
  name: "Riverside Office — Architectural Specification",
  revision: "A",
  requirements: demoRequirementsA
};

export const demoSpecificationB: SpecificationPackage = {
  name: "Riverside Office — Architectural Specification",
  revision: "B",
  requirements: demoRequirementsB
};

export const DEMO_WAIVE_REQUIREMENT_ID = "req-stockroom-door-width";

export function buildDemoValidation(requirements: Requirement[]): {
  model: NormalizedModel;
  requirements: Requirement[];
  results: ValidationResult[];
  metrics: ReturnType<typeof calculateComplianceMetrics>;
} {
  const validated = validateWithDeterministicRules(demoModel, requirements);
  return {
    ...validated,
    metrics: calculateComplianceMetrics(validated.requirements, validated.results)
  };
}

/** Summarise expected demo outcomes for tests and onboarding copy. */
export function summariseDemoOutcomes(): {
  passes: number;
  fails: number;
  unknowns: number;
  waiveRequirementId: string;
} {
  const { results } = buildDemoValidation(demoRequirementsA);
  return {
    passes: results.filter((result) => result.status === "pass").length,
    fails: results.filter((result) => result.status === "fail").length,
    unknowns: results.filter((result) => result.status === "unknown").length,
    waiveRequirementId: DEMO_WAIVE_REQUIREMENT_ID
  };
}
