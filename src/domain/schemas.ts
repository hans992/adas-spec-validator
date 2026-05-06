import { z } from "zod";

const validationSeveritySchema = z.enum(["info", "warning", "critical"]);
const roomTypeSchema = z.enum(["stockroom", "office", "meeting_room", "corridor"]);

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
});

const minimumRoomAreaRequirementSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  type: z.literal("minimum_room_area"),
  severity: validationSeveritySchema,
  roomType: roomTypeSchema,
  minAreaSqm: z.number().positive()
});

const minimumDoorWidthRequirementSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  type: z.literal("minimum_door_width_for_room_type"),
  severity: validationSeveritySchema,
  roomType: roomTypeSchema,
  minDoorWidthM: z.number().positive()
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
]);

export const requirementsSchema = z.array(requirementSchema).min(1);
