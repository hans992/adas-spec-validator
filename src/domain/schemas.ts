import { z } from "zod";

const validationSeveritySchema = z.enum(["info", "warning", "critical"]);
const roomTypeSchema = z.enum(["stockroom", "office", "meeting_room", "corridor", "unknown"]);
const requirementSourceSchema = z.object({
  document: z.string().trim().min(1).max(200),
  section: z.string().trim().min(1).max(200),
  revision: z.string().trim().min(1).max(100).optional()
}).strict();
const quantityTypeSchema = z.enum(["length", "area", "volume", "count", "percentage", "angle", "untyped"]);
const requirementMetadataShape = {
  description: z.string().trim().max(4000).optional(),
  discipline: z.string().trim().max(100).optional(),
  elementType: z.string().trim().max(100).optional(),
  quantityType: quantityTypeSchema.optional(),
  unit: z.string().trim().max(30).optional(),
  notes: z.string().trim().max(4000).optional(),
  derivedFields: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
  automationStatus: z.enum([
    "valid_requirement",
    "informational",
    "requires_rule_configuration",
    "ready_for_validation"
  ]).optional()
};

const levelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1)
});

const roomSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  levelId: z.string().min(1),
  roomType: roomTypeSchema,
  areaSqm: z.number().positive().optional(),
  connectedDoorIds: z.array(z.string().min(1)).optional()
});

const doorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  levelId: z.string().min(1),
  widthM: z.number().positive().optional(),
  connectedRoomIds: z.array(z.string().min(1)).optional()
});

export const normalizedModelSchema = z.object({
  levels: z.array(levelSchema).min(1),
  rooms: z.array(roomSchema),
  doors: z.array(doorSchema)
}).superRefine((model, context) => {
  const levelIds = new Set<string>();
  const roomIds = new Set<string>();
  const doorIds = new Set<string>();

  const registerUniqueId = (id: string, path: (string | number)[]) => {
    if (levelIds.has(id) || roomIds.has(id) || doorIds.has(id)) {
      context.addIssue({ code: "custom", path, message: `Duplicate model element id: ${id}` });
    }
  };

  model.levels.forEach((level, index) => {
    registerUniqueId(level.id, ["levels", index, "id"]);
    levelIds.add(level.id);
  });
  model.rooms.forEach((room, index) => {
    registerUniqueId(room.id, ["rooms", index, "id"]);
    roomIds.add(room.id);
  });
  model.doors.forEach((door, index) => {
    registerUniqueId(door.id, ["doors", index, "id"]);
    doorIds.add(door.id);
  });

  model.rooms.forEach((room, roomIndex) => {
    if (!levelIds.has(room.levelId)) {
      context.addIssue({ code: "custom", path: ["rooms", roomIndex, "levelId"], message: `Unknown level id: ${room.levelId}` });
    }
    room.connectedDoorIds?.forEach((doorId, doorIndex) => {
      const door = model.doors.find((candidate) => candidate.id === doorId);
      if (!door) {
        context.addIssue({ code: "custom", path: ["rooms", roomIndex, "connectedDoorIds", doorIndex], message: `Unknown door id: ${doorId}` });
      } else if (!door.connectedRoomIds?.includes(room.id)) {
        context.addIssue({ code: "custom", path: ["rooms", roomIndex, "connectedDoorIds", doorIndex], message: `Relationship ${room.id} -> ${doorId} is not reciprocal` });
      }
    });
  });

  model.doors.forEach((door, doorIndex) => {
    if (!levelIds.has(door.levelId)) {
      context.addIssue({ code: "custom", path: ["doors", doorIndex, "levelId"], message: `Unknown level id: ${door.levelId}` });
    }
    door.connectedRoomIds?.forEach((roomId, roomIndex) => {
      const room = model.rooms.find((candidate) => candidate.id === roomId);
      if (!room) {
        context.addIssue({ code: "custom", path: ["doors", doorIndex, "connectedRoomIds", roomIndex], message: `Unknown room id: ${roomId}` });
      } else if (!room.connectedDoorIds?.includes(door.id)) {
        context.addIssue({ code: "custom", path: ["doors", doorIndex, "connectedRoomIds", roomIndex], message: `Relationship ${door.id} -> ${roomId} is not reciprocal` });
      }
    });
  });
});

const minimumRoomAreaRequirementSchema = z.object({
  ...requirementMetadataShape,
  id: z.string().min(1),
  title: z.string().min(1),
  type: z.literal("minimum_room_area"),
  severity: validationSeveritySchema,
  source: requirementSourceSchema.optional(),
  roomType: roomTypeSchema,
  minAreaSqm: z.number().positive(),
  maxAreaSqm: z.number().positive().optional()
}).strict();

const minimumDoorWidthRequirementSchema = z.object({
  ...requirementMetadataShape,
  id: z.string().min(1),
  title: z.string().min(1),
  type: z.literal("minimum_door_width_for_room_type"),
  severity: validationSeveritySchema,
  source: requirementSourceSchema.optional(),
  roomType: roomTypeSchema,
  minDoorWidthM: z.number().positive(),
  maxDoorWidthM: z.number().positive().optional(),
  quantifier: z.enum(["any", "all"]).optional()
}).strict();

const roomHasConnectedDoorRequirementSchema = z.object({
  ...requirementMetadataShape,
  id: z.string().min(1),
  title: z.string().min(1),
  type: z.literal("room_has_connected_door"),
  severity: validationSeveritySchema,
  source: requirementSourceSchema.optional()
}).strict();

const roomAreaConditionSchema = z.object({
  type: z.literal("room_area_range"),
  minAreaSqm: z.number().positive(),
  maxAreaSqm: z.number().positive().optional()
});

const doorWidthConditionSchema = z.object({
  type: z.literal("connected_door_width_range"),
  minDoorWidthM: z.number().positive(),
  maxDoorWidthM: z.number().positive().optional(),
  quantifier: z.enum(["any", "all"]).optional()
});

const compositeRoomRuleSchema = z.object({
  ...requirementMetadataShape,
  id: z.string().min(1),
  title: z.string().min(1),
  type: z.literal("composite_room_rule"),
  severity: validationSeveritySchema,
  source: requirementSourceSchema.optional(),
  roomType: roomTypeSchema,
  operator: z.enum(["and", "or"]),
  conditions: z
    .array(z.discriminatedUnion("type", [roomAreaConditionSchema, doorWidthConditionSchema]))
    .min(2)
    .max(10)
}).strict();

const textualRequirementSchema = z.object({
  ...requirementMetadataShape,
  id: z.string().min(1),
  title: z.string().min(1),
  type: z.literal("textual_requirement"),
  severity: validationSeveritySchema,
  source: requirementSourceSchema.optional(),
  automationStatus: z.enum(["valid_requirement", "informational", "requires_rule_configuration"])
}).strict();

export const requirementSchema = z.discriminatedUnion("type", [
  minimumRoomAreaRequirementSchema,
  minimumDoorWidthRequirementSchema,
  roomHasConnectedDoorRequirementSchema,
  compositeRoomRuleSchema,
  textualRequirementSchema
]).superRefine((requirement, context) => {
  if (requirement.type === "minimum_room_area") {
    if (requirement.quantityType !== undefined && requirement.quantityType !== "area") {
      context.addIssue({ code: "custom", path: ["quantityType"], message: "Room area rules require quantityType 'area'" });
    }
    if (requirement.unit !== undefined && !["m²", "m2", "sqm"].includes(requirement.unit.toLowerCase())) {
      context.addIssue({ code: "custom", path: ["unit"], message: "Room area rules require an area unit" });
    }
  }
  if (requirement.type === "minimum_door_width_for_room_type") {
    if (requirement.quantityType !== undefined && requirement.quantityType !== "length") {
      context.addIssue({ code: "custom", path: ["quantityType"], message: "Door width rules require quantityType 'length'" });
    }
    if (requirement.unit !== undefined && !["mm", "cm", "m"].includes(requirement.unit.toLowerCase())) {
      context.addIssue({ code: "custom", path: ["unit"], message: "Door width rules require a length unit" });
    }
  }
  if (
    requirement.type === "minimum_room_area" &&
    requirement.maxAreaSqm !== undefined &&
    requirement.maxAreaSqm < requirement.minAreaSqm
  ) {
    context.addIssue({
      code: "custom",
      path: ["maxAreaSqm"],
      message: "Maximum room area must be greater than or equal to minimum room area"
    });
  }
  if (
    requirement.type === "minimum_door_width_for_room_type" &&
    requirement.maxDoorWidthM !== undefined &&
    requirement.maxDoorWidthM < requirement.minDoorWidthM
  ) {
    context.addIssue({
      code: "custom",
      path: ["maxDoorWidthM"],
      message: "Maximum door width must be greater than or equal to minimum door width"
    });
  }
  if (requirement.type === "composite_room_rule") {
    requirement.conditions.forEach((condition, index) => {
      const minimum = condition.type === "room_area_range"
        ? condition.minAreaSqm
        : condition.minDoorWidthM;
      const maximum = condition.type === "room_area_range"
        ? condition.maxAreaSqm
        : condition.maxDoorWidthM;
      if (maximum !== undefined && maximum < minimum) {
        context.addIssue({
          code: "custom",
          path: ["conditions", index, condition.type === "room_area_range" ? "maxAreaSqm" : "maxDoorWidthM"],
          message: "Condition maximum must be greater than or equal to its minimum"
        });
      }
    });
  }
});

export const requirementsSchema = z.array(requirementSchema).min(1).max(1000).superRefine((requirements, context) => {
  const seen = new Set<string>();
  requirements.forEach((requirement, index) => {
    if (seen.has(requirement.id)) {
      context.addIssue({ code: "custom", path: [index, "id"], message: `Duplicate requirement id: ${requirement.id}` });
    }
    seen.add(requirement.id);
  });
});

export const specificationPackageSchema = z.object({
  name: z.string().trim().min(1).max(200),
  revision: z.string().trim().min(1).max(100),
  requirements: requirementsSchema
}).strict();
