export type RoomType = "stockroom" | "office" | "meeting_room" | "corridor";

export type ValidationStatus = "pass" | "fail" | "unknown";
export type ValidationSeverity = "info" | "warning" | "critical";

export interface Level {
  id: string;
  name: string;
}

export interface Room {
  id: string;
  name: string;
  levelId: string;
  roomType: RoomType;
  areaSqm?: number;
  connectedDoorIds?: string[];
}

export interface Door {
  id: string;
  name: string;
  levelId: string;
  widthM?: number;
  connectedRoomIds?: string[];
}

export interface NormalizedModel {
  levels: Level[];
  rooms: Room[];
  doors: Door[];
}

export type Requirement =
  | {
      id: string;
      title: string;
      type: "minimum_room_area";
      severity: ValidationSeverity;
      roomType: RoomType;
      minAreaSqm: number;
    }
  | {
      id: string;
      title: string;
      type: "minimum_door_width_for_room_type";
      severity: ValidationSeverity;
      roomType: RoomType;
      minDoorWidthM: number;
    }
  | {
      id: string;
      title: string;
      type: "room_has_connected_door";
      severity: ValidationSeverity;
    };

export interface EvidenceItem {
  message: string;
  observed?: string | number | null;
  expected?: string | number | null;
  field?: string;
}

export interface ValidationResult {
  ruleId: string;
  requirementId: string;
  requirementTitle: string;
  elementType: "room" | "door" | "model";
  status: ValidationStatus;
  severity: ValidationSeverity;
  summary: string;
  affectedElementIds: string[];
  evidence: EvidenceItem[];
}
