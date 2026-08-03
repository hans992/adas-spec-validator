import { z } from "zod";

const validationSeveritySchema = z.enum(["info", "warning", "critical"]);
const roomTypeSchema = z.enum(["stockroom", "office", "meeting_room", "corridor", "unknown"]);

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
  id: z.string().min(1),
  title: z.string().min(1),
  type: z.literal("minimum_room_area"),
  severity: validationSeveritySchema,
  roomType: roomTypeSchema,
  minAreaSqm: z.number().positive(),
  maxAreaSqm: z.number().positive().optional()
});

const minimumDoorWidthRequirementSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  type: z.literal("minimum_door_width_for_room_type"),
  severity: validationSeveritySchema,
  roomType: roomTypeSchema,
  minDoorWidthM: z.number().positive(),
  maxDoorWidthM: z.number().positive().optional(),
  quantifier: z.enum(["any", "all"]).optional()
});

const roomHasConnectedDoorRequirementSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  type: z.literal("room_has_connected_door"),
  severity: validationSeveritySchema
});

export const requirementSchema = z.discriminatedUnion("type", [
  minimumRoomAreaRequirementSchema,
  minimumDoorWidthRequirementSchema,
  roomHasConnectedDoorRequirementSchema
]).superRefine((requirement, context) => {
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
});

export const requirementsSchema = z.array(requirementSchema).min(1);
