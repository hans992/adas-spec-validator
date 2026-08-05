export type RoomType = "stockroom" | "office" | "meeting_room" | "corridor" | "unknown";

export type ValidationStatus = "pass" | "fail" | "unknown" | "not_applicable";
export type ValidationSeverity = "info" | "warning" | "critical";
export type DoorQuantifier = "any" | "all";
export type LogicalOperator = "and" | "or";
export type QuantityType = "length" | "area" | "volume" | "count" | "percentage" | "angle" | "untyped";
export type RequirementAutomationStatus =
  | "valid_requirement"
  | "informational"
  | "requires_rule_configuration"
  | "ready_for_validation";

export interface RequirementMetadata {
  description?: string;
  discipline?: string;
  elementType?: string;
  quantityType?: QuantityType;
  unit?: string;
  notes?: string;
  derivedFields?: string[];
  automationStatus?: RequirementAutomationStatus;
  sourceFragmentIds?: string[];
  sourceApproval?: SourceApproval;
  provenance?: RequirementProvenance;
}

export type SourceApprovalStatus = "pending" | "approved" | "rejected";

export interface SourceApproval {
  status: SourceApprovalStatus;
  approvedBy?: string;
  approvedAt?: string;
}

export interface RequirementProvenance {
  origin: "deterministic" | "ai_draft" | "user";
  mergedFromDraftIds?: string[];
  splitFromDraftId?: string;
  supersededByDraftIds?: string[];
  superseded?: boolean;
}

export type DocxSourceAnchor =
  | {
      kind: "paragraph";
      bodyIndex: number;
      paragraphIndex: number;
      startOffset: number;
      endOffset: number;
    }
  | {
      kind: "table_cell";
      tableIndex: number;
      rowIndex: number;
      cellIndex: number;
      paragraphIndex?: number;
      startOffset?: number;
      endOffset?: number;
    };

export type PdfSourceAnchor =
  | {
      kind: "pdf_text_block";
      pageIndex: number;
      pageNumber: number;
      bbox: { x: number; y: number; width: number; height: number };
      startOffset: number;
      endOffset: number;
    }
  | {
      kind: "pdf_table_cell";
      pageIndex: number;
      pageNumber: number;
      tableIndex: number;
      rowIndex: number;
      cellIndex: number;
      bbox: { x: number; y: number; width: number; height: number };
      startOffset?: number;
      endOffset?: number;
    };

export type DocumentSourceAnchor = DocxSourceAnchor | PdfSourceAnchor;

export type DocumentFragmentKind =
  | "heading"
  | "subheading"
  | "numbered_clause"
  | "bullet_item"
  | "table_cell"
  | "mandatory_candidate"
  | "paragraph"
  | "metadata";

export type FragmentExtractionQuality =
  | "digital_text"
  | "unreliable_layout"
  | "table_heuristic"
  | "sparse_text";

export interface DocumentFragment {
  fragmentId: string;
  kind: DocumentFragmentKind;
  exactText: string;
  numberingLabel?: string;
  headingPath: string[];
  tableRef?: { tableIndex: number; rowIndex: number; cellIndex: number };
  sourceAnchor: DocumentSourceAnchor;
  revisionContent?: boolean;
  languageHints?: string[];
  extractionQuality?: FragmentExtractionQuality;
  /** Present only when OCR is introduced in a later version; v1 digital import never sets this. */
  ocrConfidence?: number;
}

export type PdfPageQuality = "digital_text" | "sparse_text" | "likely_scanned" | "empty";

export interface PdfPageSummary {
  pageNumber: number;
  width: number;
  height: number;
  textItemCount: number;
  charCount: number;
  quality: PdfPageQuality;
  hasImages: boolean;
}

export interface DocxDocumentSourceSnapshot {
  kind: "docx";
  fileName: string;
  contentHash: string;
  parserVersion: string;
  language?: string;
  metadata: {
    title?: string;
    creator?: string;
    subject?: string;
    description?: string;
    lastModifiedBy?: string;
    created?: string;
    modified?: string;
  };
  fragments: DocumentFragment[];
  unsupportedContent: Array<{ kind: string; count: number; message: string }>;
  trackChanges: {
    present: boolean;
    insertedRuns: number;
    deletedRuns: number;
    comments: number;
    warning?: string;
  };
  fragmentRequirementMap: Array<{
    requirementId: string;
    fragmentIds: string[];
    textRanges: Array<{
      fragmentId: string;
      startOffset: number;
      endOffset: number;
      exactText: string;
    }>;
  }>;
}

export interface PdfDocumentSourceSnapshot {
  kind: "pdf";
  fileName: string;
  contentHash: string;
  parserVersion: string;
  language?: string;
  metadata: {
    title?: string;
    creator?: string;
    subject?: string;
    description?: string;
    lastModifiedBy?: string;
    created?: string;
    modified?: string;
  };
  pageCount: number;
  pages: PdfPageSummary[];
  fragments: DocumentFragment[];
  unsupportedContent: Array<{ kind: string; count: number; message: string }>;
  extractionMode: "digital_text_only";
  ocr: {
    enabled: false;
    note: string;
  };
  unreliableTableCount: number;
  fragmentRequirementMap: Array<{
    requirementId: string;
    fragmentIds: string[];
    textRanges: Array<{
      fragmentId: string;
      startOffset: number;
      endOffset: number;
      exactText: string;
    }>;
  }>;
}

export type DocumentSourceSnapshot = DocxDocumentSourceSnapshot | PdfDocumentSourceSnapshot;

export interface RequirementSource {
  document: string;
  section: string;
  revision?: string;
}

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
  | (RequirementMetadata & {
      id: string;
      title: string;
      type: "minimum_room_area";
      severity: ValidationSeverity;
      source?: RequirementSource;
      roomType: RoomType;
      minAreaSqm: number;
      maxAreaSqm?: number;
    })
  | (RequirementMetadata & {
      id: string;
      title: string;
      type: "minimum_door_width_for_room_type";
      severity: ValidationSeverity;
      source?: RequirementSource;
      roomType: RoomType;
      minDoorWidthM: number;
      maxDoorWidthM?: number;
      quantifier?: DoorQuantifier;
    })
  | (RequirementMetadata & {
      id: string;
      title: string;
      type: "room_has_connected_door";
      severity: ValidationSeverity;
      source?: RequirementSource;
    })
  | (RequirementMetadata & {
      id: string;
      title: string;
      type: "composite_room_rule";
      severity: ValidationSeverity;
      source?: RequirementSource;
      roomType: RoomType;
      operator: LogicalOperator;
      conditions: CompositeCondition[];
    })
  | (RequirementMetadata & {
      id: string;
      title: string;
      type: "textual_requirement";
      severity: ValidationSeverity;
      source?: RequirementSource;
      automationStatus: "valid_requirement" | "informational" | "requires_rule_configuration";
    });

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

export interface SpecificationPackage {
  name: string;
  revision: string;
  requirements: Requirement[];
  documentSource?: DocumentSourceSnapshot;
}
