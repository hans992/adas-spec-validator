import type {
  Door,
  NormalizedModel,
  Requirement,
  Room,
  ValidationResult
} from "@/domain/types";

const MIN_ROOM_AREA_RULE_ID = "MinimumRoomAreaRule";
const MIN_DOOR_WIDTH_RULE_ID = "MinimumDoorWidthForRoomTypeRule";
const ROOM_HAS_CONNECTED_DOOR_RULE_ID = "RoomHasConnectedDoorRule";

export function runDeterministicValidation(
  model: NormalizedModel,
  requirements: Requirement[]
): ValidationResult[] {
  const output: ValidationResult[] = [];

  for (const requirement of requirements) {
    switch (requirement.type) {
      case "minimum_room_area":
        output.push(...evaluateMinimumRoomArea(model, requirement));
        break;
      case "minimum_door_width_for_room_type":
        output.push(...evaluateMinimumDoorWidthForRoomType(model, requirement));
        break;
      case "room_has_connected_door":
        output.push(...evaluateRoomHasConnectedDoor(model, requirement));
        break;
      default: {
        const exhaustiveCheck: never = requirement;
        throw new Error(`Unhandled requirement type: ${exhaustiveCheck}`);
      }
    }
  }

  return output;
}

function evaluateMinimumRoomArea(
  model: NormalizedModel,
  requirement: Extract<Requirement, { type: "minimum_room_area" }>
): ValidationResult[] {
  return model.rooms
    .filter((room) => room.roomType === requirement.roomType)
    .map((room) => {
      if (room.areaSqm === undefined) {
        return {
          ruleId: MIN_ROOM_AREA_RULE_ID,
          requirementId: requirement.id,
          requirementTitle: requirement.title,
          elementType: "room",
          status: "unknown",
          severity: requirement.severity,
          summary: `Cannot verify area for ${room.name}; area is missing.`,
          affectedElementIds: [room.id],
          evidence: [
            {
              message: "Area parameter is not available in normalized model data.",
              field: "room.areaSqm",
              observed: null,
              expected: `>= ${requirement.minAreaSqm}`
            }
          ]
        };
      }

      const passes = room.areaSqm >= requirement.minAreaSqm;
      return {
        ruleId: MIN_ROOM_AREA_RULE_ID,
        requirementId: requirement.id,
        requirementTitle: requirement.title,
        elementType: "room",
        status: passes ? "pass" : "fail",
        severity: requirement.severity,
        summary: passes
          ? `${room.name} satisfies minimum area (${room.areaSqm} sqm >= ${requirement.minAreaSqm} sqm).`
          : `${room.name} violates minimum area (${room.areaSqm} sqm < ${requirement.minAreaSqm} sqm).`,
        affectedElementIds: [room.id],
        evidence: [
          {
            message: "Room area was compared against deterministic threshold.",
            field: "room.areaSqm",
            observed: room.areaSqm,
            expected: requirement.minAreaSqm
          }
        ]
      };
    });
}

function evaluateMinimumDoorWidthForRoomType(
  model: NormalizedModel,
  requirement: Extract<Requirement, { type: "minimum_door_width_for_room_type" }>
): ValidationResult[] {
  const doorById = new Map<string, Door>(model.doors.map((door) => [door.id, door]));

  return model.rooms
    .filter((room) => room.roomType === requirement.roomType)
    .map((room) => validateRoomDoorWidths(room, requirement, doorById));
}

function validateRoomDoorWidths(
  room: Room,
  requirement: Extract<Requirement, { type: "minimum_door_width_for_room_type" }>,
  doorById: Map<string, Door>
): ValidationResult {
  if (room.connectedDoorIds === undefined) {
    return {
      ruleId: MIN_DOOR_WIDTH_RULE_ID,
      requirementId: requirement.id,
      requirementTitle: requirement.title,
      elementType: "room",
      status: "unknown",
      severity: requirement.severity,
      summary: `Cannot verify door widths for ${room.name}; door relationship data is missing.`,
      affectedElementIds: [room.id],
      evidence: [
        {
          message: "Connected door identifiers are required but not available.",
          field: "room.connectedDoorIds",
          observed: null,
          expected: "Array of door ids"
        }
      ]
    };
  }

  if (room.connectedDoorIds.length === 0) {
    return {
      ruleId: MIN_DOOR_WIDTH_RULE_ID,
      requirementId: requirement.id,
      requirementTitle: requirement.title,
      elementType: "room",
      status: "fail",
      severity: requirement.severity,
      summary: `${room.name} has no connected doors; required minimum door width cannot be met.`,
      affectedElementIds: [room.id],
      evidence: [
        {
          message: "No connected door found for room.",
          field: "room.connectedDoorIds",
          observed: "[]",
          expected: `At least one door width >= ${requirement.minDoorWidthM}m`
        }
      ]
    };
  }

  const missingDoorId = room.connectedDoorIds.find((doorId) => !doorById.has(doorId));
  if (missingDoorId !== undefined) {
    return {
      ruleId: MIN_DOOR_WIDTH_RULE_ID,
      requirementId: requirement.id,
      requirementTitle: requirement.title,
      elementType: "room",
      status: "unknown",
      severity: requirement.severity,
      summary: `Cannot verify ${room.name}; connected door ${missingDoorId} is not present in model doors.`,
      affectedElementIds: [room.id, missingDoorId],
      evidence: [
        {
          message: "Door id referenced by room cannot be resolved in door set.",
          field: "room.connectedDoorIds",
          observed: missingDoorId,
          expected: "Door id existing in model.doors"
        }
      ]
    };
  }

  const connectedDoors = room.connectedDoorIds.map((doorId) => doorById.get(doorId)!);
  const doorsWithMissingWidth = connectedDoors.filter((door) => door.widthM === undefined);
  if (doorsWithMissingWidth.length > 0) {
    return {
      ruleId: MIN_DOOR_WIDTH_RULE_ID,
      requirementId: requirement.id,
      requirementTitle: requirement.title,
      elementType: "room",
      status: "unknown",
      severity: requirement.severity,
      summary: `Cannot fully verify ${room.name}; one or more connected doors have missing width.`,
      affectedElementIds: [room.id, ...doorsWithMissingWidth.map((door) => door.id)],
      evidence: [
        {
          message: "Door width parameter is missing for connected door.",
          field: "door.widthM",
          observed: doorsWithMissingWidth.map((door) => door.id).join(", "),
          expected: `All connected doors width >= ${requirement.minDoorWidthM}m`
        }
      ]
    };
  }

  const failingDoors = connectedDoors.filter((door) => (door.widthM as number) < requirement.minDoorWidthM);
  const status = failingDoors.length === 0 ? "pass" : "fail";
  return {
    ruleId: MIN_DOOR_WIDTH_RULE_ID,
    requirementId: requirement.id,
    requirementTitle: requirement.title,
    elementType: "room",
    status,
    severity: requirement.severity,
    summary:
      status === "pass"
        ? `${room.name} door widths satisfy minimum ${requirement.minDoorWidthM}m.`
        : `${room.name} has door widths below ${requirement.minDoorWidthM}m.`,
    affectedElementIds: [room.id, ...connectedDoors.map((door) => door.id)],
    evidence: [
      {
        message:
          status === "pass"
            ? "All connected door widths meet the deterministic threshold."
            : "Connected door width is below deterministic threshold.",
        field: "door.widthM",
        observed:
          status === "pass"
            ? connectedDoors.map((door) => `${door.id}:${door.widthM}`).join(", ")
            : failingDoors.map((door) => `${door.id}:${door.widthM}`).join(", "),
        expected: `>= ${requirement.minDoorWidthM}m`
      }
    ]
  };
}

function evaluateRoomHasConnectedDoor(
  model: NormalizedModel,
  requirement: Extract<Requirement, { type: "room_has_connected_door" }>
): ValidationResult[] {
  return model.rooms.map((room) => {
    if (room.connectedDoorIds === undefined) {
      return {
        ruleId: ROOM_HAS_CONNECTED_DOOR_RULE_ID,
        requirementId: requirement.id,
        requirementTitle: requirement.title,
        elementType: "room",
        status: "unknown",
        severity: requirement.severity,
        summary: `Cannot verify connected doors for ${room.name}; relationship data is missing.`,
        affectedElementIds: [room.id],
        evidence: [
          {
            message: "Connected door relationship is missing in normalized data.",
            field: "room.connectedDoorIds",
            observed: null,
            expected: "At least one connected door id"
          }
        ]
      };
    }

    const hasDoor = room.connectedDoorIds.length > 0;
    return {
      ruleId: ROOM_HAS_CONNECTED_DOOR_RULE_ID,
      requirementId: requirement.id,
      requirementTitle: requirement.title,
      elementType: "room",
      status: hasDoor ? "pass" : "fail",
      severity: requirement.severity,
      summary: hasDoor
        ? `${room.name} has at least one connected door.`
        : `${room.name} has no connected doors.`,
      affectedElementIds: [room.id],
      evidence: [
        {
          message: "Room-to-door relationships were checked for minimum connectivity.",
          field: "room.connectedDoorIds",
          observed: room.connectedDoorIds.length,
          expected: ">= 1"
        }
      ]
    };
  });
}
