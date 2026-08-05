import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";
import JSZip from "jszip";

import {
  buildAuditBundle,
  normalizeFindingEvidence,
  normalizeReviewDecision
} from "@/domain/auditPackage";
import type { Requirement, ValidationResult } from "@/domain/types";
import type { ValidationSnapshot } from "@/domain/validationComparison";
import { findingEvidenceSchema, reviewDecisionSchema } from "@/persistence/schemas";

const requirements: Requirement[] = [
  {
    id: "REQ-001",
    title: "Office minimum area",
    type: "minimum_room_area",
    severity: "critical",
    roomType: "office",
    minAreaSqm: 9
  }
];

const results: ValidationResult[] = [
  {
    ruleId: "rule-area",
    requirementId: "REQ-001",
    requirementTitle: "Office minimum area",
    elementType: "room",
    status: "fail",
    severity: "critical",
    summary: "Office R1 is 8 m².",
    affectedElementIds: ["room-r1"],
    evidence: [{ message: "Observed area 8 m²", observed: 8, expected: 9 }]
  }
];

const snapshot: ValidationSnapshot = {
  id: "run-1",
  model_name: "office.ifc",
  created_at: "2026-08-05T12:00:00.000Z",
  normalized_model: {
    levels: [{ id: "l1", name: "Ground" }],
    rooms: [{ id: "room-r1", name: "Office", levelId: "l1", roomType: "office", areaSqm: 8 }],
    doors: []
  },
  requirements,
  results
};

describe("review and evidence schemas", () => {
  it("requires a waiver reason for waived decisions", () => {
    expect(() => reviewDecisionSchema.parse({
      requirementId: "REQ-001",
      status: "waived",
      comment: "ok"
    })).toThrow();
    expect(reviewDecisionSchema.parse({
      requirementId: "REQ-001",
      status: "waived",
      comment: "ok",
      waiverReason: "Existing building",
      waiverExpiresAt: "2027-01-01T00:00:00.000Z"
    })).toMatchObject({ waiverReason: "Existing building" });
  });

  it("validates evidence kinds and payloads", () => {
    expect(findingEvidenceSchema.parse({
      requirementId: "REQ-001",
      findingKey: "REQ-001|rule-area|room-r1",
      kind: "comment",
      title: "Site note",
      comment: "Measured on site."
    }).kind).toBe("comment");
    expect(() => findingEvidenceSchema.parse({
      requirementId: "REQ-001",
      findingKey: "k",
      kind: "link",
      title: "Doc",
      comment: ""
    })).toThrow();
  });
});

describe("audit package builders", () => {
  it("normalizes review and evidence rows from persistence shape", () => {
    expect(normalizeReviewDecision({
      decision_id: "dec-1",
      requirement_id: "REQ-001",
      status: "waived",
      comment: "Accepted",
      waiver_reason: "Existing building",
      updated_by: "user-1",
      updated_at: "2026-08-05T13:00:00.000Z"
    })).toMatchObject({
      decisionId: "dec-1",
      status: "waived",
      waiverReason: "Existing building",
      reviewerId: "user-1"
    });

    expect(normalizeFindingEvidence({
      id: "ev-1",
      requirement_id: "REQ-001",
      finding_key: "REQ-001|rule-area|room-r1",
      kind: "link",
      title: "Photo album",
      link_url: "https://example.com/album",
      created_by: "user-1",
      created_at: "2026-08-05T13:05:00.000Z"
    })).toMatchObject({
      kind: "link",
      linkUrl: "https://example.com/album",
      authorId: "user-1"
    });
  });

  it("builds a checksummed ZIP without claiming a digital signature", async () => {
    const fileBytes = Buffer.from("screenshot-bytes");
    const fileHash = createHash("sha256").update(fileBytes).digest("hex");
    const { zip, manifest } = await buildAuditBundle({
      project: { id: "project-1", name: "Demo tower" },
      snapshot,
      specification: { name: "Office brief", revision: "B" },
      modelFingerprint: {
        sourceFileName: "office.ifc",
        sourceContentHash: "a".repeat(64),
        inputFingerprint: "fp-1"
      },
      reviews: [{
        decisionId: "dec-current",
        requirementId: "REQ-001",
        status: "acknowledged",
        comment: "Under remediation",
        reviewerId: "user-1",
        decidedAt: "2026-08-05T14:00:00.000Z"
      }],
      reviewHistory: [{
        decisionId: "dec-old",
        requirementId: "REQ-001",
        status: "open",
        comment: "Opened",
        reviewerId: "user-1",
        decidedAt: "2026-08-05T12:30:00.000Z",
        superseded: true,
        supersededAt: "2026-08-05T14:00:00.000Z",
        supersededByDecisionId: "dec-current"
      }],
      evidence: [{
        id: "ev-file",
        requirementId: "REQ-001",
        findingKey: "REQ-001|rule-area|room-r1",
        kind: "screenshot",
        title: "Plan mark-up",
        comment: "",
        fileName: "plan.png",
        fileMime: "image/png",
        fileSizeBytes: fileBytes.byteLength,
        fileContentHash: fileHash,
        fileContentBase64: fileBytes.toString("base64"),
        authorId: "user-1",
        createdAt: "2026-08-05T13:10:00.000Z"
      }],
      generatedAt: "2026-08-05T15:00:00.000Z",
      generatedBy: "user-1"
    });

    expect(manifest.packageKind).toBe("aec-audit-bundle");
    expect(manifest.integrity.method).toBe("sha256-manifest");
    expect(manifest.integrity.note).toContain("not digitally signed");
    expect(manifest.packageSha256).toMatch(/^[a-f0-9]{64}$/);

    const archive = await JSZip.loadAsync(zip);
    const expectedPaths = [
      "manifest.json",
      "CHECKSUMS.sha256",
      "project.json",
      "specification.json",
      "validation-configuration.json",
      "model-fingerprint.json",
      "findings.json",
      "evidence/index.json",
      "evidence/files/ev-file-plan.png",
      "reviews/current.json",
      "reviews/history.json",
      "traceability/matrix.csv",
      "traceability/matrix.xlsx",
      "results/results.json",
      "results/results.xlsx",
      "report/report.pdf",
      "audit-log.json"
    ];
    for (const path of expectedPaths) {
      expect(archive.file(path), path).toBeTruthy();
    }

    const checksums = await archive.file("CHECKSUMS.sha256")!.async("string");
    expect(checksums).toContain("project.json");
    expect(checksums).not.toContain("manifest.json");

    const body = JSON.parse(await archive.file("manifest.json")!.async("string"));
    expect(body.integrity.note).toContain("not digitally signed");
    expect(body.files.some((entry: { path: string }) => entry.path === "report/report.pdf")).toBe(true);
  });
});
