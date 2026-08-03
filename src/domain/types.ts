export type RoomType = "stockroom" | "office" | "meeting_room" | "corridor" | "unknown";

export type ValidationStatus = "pass" | "fail" | "unknown" | "not_applicable";
export type ValidationSeverity = "info" | "warning" | "critical";
export type DoorQuantifier = "any" | "all";
export type LogicalOperator = "and" | "or";

export type CompositeCondition =
  | {
      type: "room_area_range";
      minAreaSqm: number;
      maxAreaSqm?: number;
    }
  | {
      type: "connected_door_width_range";
      minDoorWidthM: number;
      maxDoorWidthM?: number;
      quantifier?: DoorQuantifier;
    };

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
      maxAreaSqm?: number;
    }
  | {
      id: string;
      title: string;
      type: "minimum_door_width_for_room_type";
      severity: ValidationSeverity;
      roomType: RoomType;
      minDoorWidthM: number;
      maxDoorWidthM?: number;
      quantifier?: DoorQuantifier;
    }
  | {
      id: string;
      title: string;
      type: "room_has_connected_door";
      severity: ValidationSeverity;
    }
  | {
      id: string;
      title: string;
      type: "composite_room_rule";
      severity: ValidationSeverity;
      roomType: RoomType;
      operator: LogicalOperator;
      conditions: CompositeCondition[];
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
