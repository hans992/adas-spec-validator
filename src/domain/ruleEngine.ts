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
  const targetRooms = model.rooms.filter((room) => room.roomType === requirement.roomType);
  if (targetRooms.length === 0) return [notApplicableResult(requirement, requirement.roomType)];
  return targetRooms
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

      const expectedRange = formatRange(requirement.minAreaSqm, requirement.maxAreaSqm, "sqm");
      const passes = isWithinRange(room.areaSqm, requirement.minAreaSqm, requirement.maxAreaSqm);
      return {
        ruleId: MIN_ROOM_AREA_RULE_ID,
        requirementId: requirement.id,
        requirementTitle: requirement.title,
        elementType: "room",
        status: passes ? "pass" : "fail",
        severity: requirement.severity,
        summary: passes
          ? `${room.name} area ${room.areaSqm} sqm satisfies ${expectedRange}.`
          : `${room.name} area ${room.areaSqm} sqm violates ${expectedRange}.`,
        affectedElementIds: [room.id],
        evidence: [
          {
            message: "Room area was compared against deterministic threshold.",
            field: "room.areaSqm",
            observed: room.areaSqm,
            expected: expectedRange
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

  const targetRooms = model.rooms.filter((room) => room.roomType === requirement.roomType);
  if (targetRooms.length === 0) return [notApplicableResult(requirement, requirement.roomType)];
  return targetRooms
    .map((room) => validateRoomDoorWidths(room, requirement, doorById));
}

function notApplicableResult(
  requirement: Requirement,
  roomType: Room["roomType"]
): ValidationResult {
  return {
    ruleId: `${requirement.type}:target-set`,
    requirementId: requirement.id,
    requirementTitle: requirement.title,
    elementType: "model",
    status: "not_applicable",
    severity: requirement.severity,
    summary: `Requirement is not applicable because the model contains no ${roomType} rooms.`,
    affectedElementIds: [],
    evidence: [{
      message: "No elements matched the requirement target selector.",
      field: "room.roomType",
      observed: 0,
      expected: roomType
    }]
  };
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
  const quantifier = requirement.quantifier ?? "all";
  const expectedRange = formatRange(requirement.minDoorWidthM, requirement.maxDoorWidthM, "m");
  const doorsWithMissingWidth = connectedDoors.filter((door) => door.widthM === undefined);
  const knownDoors = connectedDoors.filter((door): door is Door & { widthM: number } => door.widthM !== undefined);
  const passingDoors = knownDoors.filter((door) =>
    isWithinRange(door.widthM, requirement.minDoorWidthM, requirement.maxDoorWidthM)
  );
  const failingDoors = knownDoors.filter((door) => !passingDoors.includes(door));

  const decidedPass = quantifier === "any" ? passingDoors.length > 0 : failingDoors.length === 0 && doorsWithMissingWidth.length === 0;
  const decidedFail = quantifier === "any" ? passingDoors.length === 0 && doorsWithMissingWidth.length === 0 : failingDoors.length > 0;

  if (!decidedPass && !decidedFail) {
    return {
      ruleId: MIN_DOOR_WIDTH_RULE_ID,
      requirementId: requirement.id,
      requirementTitle: requirement.title,
      elementType: "room",
      status: "unknown",
      severity: requirement.severity,
      summary: `Cannot verify whether ${quantifier} connected doors for ${room.name} satisfy ${expectedRange}; one or more doors have missing width.`,
      affectedElementIds: [room.id, ...doorsWithMissingWidth.map((door) => door.id)],
      evidence: [
        {
          message: "Door width parameter is missing for connected door.",
          field: "door.widthM",
          observed: doorsWithMissingWidth.map((door) => door.id).join(", "),
          expected: `${quantifier} connected doors within ${expectedRange}`
        }
      ]
    };
  }

  const status = decidedPass ? "pass" : "fail";
  return {
    ruleId: MIN_DOOR_WIDTH_RULE_ID,
    requirementId: requirement.id,
    requirementTitle: requirement.title,
    elementType: "room",
    status,
    severity: requirement.severity,
    summary:
      status === "pass"
        ? `${quantifier === "any" ? "At least one" : "All"} connected doors for ${room.name} satisfy ${expectedRange}.`
        : `${quantifier === "any" ? "No" : "Not all"} connected doors for ${room.name} satisfy ${expectedRange}.`,
    affectedElementIds: [room.id, ...connectedDoors.map((door) => door.id)],
    evidence: [
      {
        message:
          status === "pass"
            ? `${quantifier === "any" ? "At least one" : "All"} connected door widths meet the deterministic range.`
            : `${quantifier === "any" ? "No" : "Not all"} connected door widths meet the deterministic range.`,
        field: "door.widthM",
        observed:
          status === "pass"
            ? knownDoors.map((door) => `${door.id}:${door.widthM}`).join(", ")
            : failingDoors.map((door) => `${door.id}:${door.widthM}`).join(", "),
        expected: `${quantifier} connected doors within ${expectedRange}`
      }
    ]
  };
}

function isWithinRange(value: number, minimum: number, maximum?: number): boolean {
  return value >= minimum && (maximum === undefined || value <= maximum);
}

function formatRange(minimum: number, maximum: number | undefined, unit: string): string {
  return maximum === undefined ? `>= ${minimum} ${unit}` : `${minimum}-${maximum} ${unit}`;
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
