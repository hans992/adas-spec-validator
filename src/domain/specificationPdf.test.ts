import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildPdfFragmentId,
  extractSpecificationPdf,
  validatePdfEnvelope
} from "@/domain/specificationPdf";
import {
  approvePdfDraftSource,
  confirmationBlockers,
  createInitialPdfDrafts,
  finalizePdfImport
} from "@/domain/specificationPdfDrafts";

const fixturePath = path.join(process.cwd(), "test/fixtures/aec-building-requirements.pdf");

function loadFixture(): ArrayBuffer {
  const buffer = readFileSync(fixturePath);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

describe("PDF envelope and digital-text extraction", () => {
  it("rejects non-pdf names, bad magic, and encrypted markers", () => {
    const bytes = loadFixture();
    expect(validatePdfEnvelope(bytes, "spec.docx").success).toBe(false);
    expect(validatePdfEnvelope(new ArrayBuffer(8), "spec.pdf").success).toBe(false);

    const encrypted = new TextEncoder().encode("%PDF-1.7\n1 0 obj\n<< /Encrypt 2 0 R >>\nendobj\n");
    expect(validatePdfEnvelope(encrypted.buffer, "locked.pdf").success).toBe(false);
  });

  it("extracts page-anchored digital text, German mandatory hints, and scanned-page warnings", async () => {
    const bytes = loadFixture();
    const first = await extractSpecificationPdf(bytes, "aec-building-requirements.pdf");
    expect(first.success).toBe(true);
    if (!first.success) return;

    expect(first.data.extractionMode).toBe("digital_text_only");
    expect(first.data.pageCount).toBe(2);
    expect(first.data.fragments.some((fragment) => fragment.exactText.includes("shall provide"))).toBe(true);
    expect(first.data.fragments.some((fragment) =>
      fragment.sourceAnchor.kind === "pdf_text_block" || fragment.sourceAnchor.kind === "pdf_table_cell"
    )).toBe(true);
    expect(first.data.fragments.every((fragment) => fragment.ocrConfidence === undefined)).toBe(true);
    expect(first.data.fragments.some((fragment) => fragment.languageHints?.includes("de"))).toBe(true);
    expect(first.data.pages.some((page) => page.quality === "empty" || page.quality === "likely_scanned" || page.quality === "sparse_text")).toBe(true);
    expect(first.data.warnings.some((warning) => /not a fully automatic import/i.test(warning))).toBe(true);
    expect(first.data.unsupportedContent.some((item) => item.kind === "likely_scanned_page" || item.kind === "image_page")
      || first.data.pages.some((page) => page.quality === "empty")).toBe(true);

    const second = await extractSpecificationPdf(bytes, "aec-building-requirements.pdf");
    expect(second.success).toBe(true);
    if (!second.success) return;
    expect(second.data.contentHash).toBe(first.data.contentHash);
    expect(second.data.fragments.map((fragment) => fragment.fragmentId))
      .toEqual(first.data.fragments.map((fragment) => fragment.fragmentId));
  });

  it("builds deterministic fragment ids from hash+anchor+text", () => {
    const anchor = {
      kind: "pdf_text_block" as const,
      pageIndex: 0,
      pageNumber: 1,
      bbox: { x: 10, y: 20, width: 100, height: 12 },
      startOffset: 0,
      endOffset: 5
    };
    expect(buildPdfFragmentId("abc", anchor, "hello")).toBe(buildPdfFragmentId("abc", anchor, "hello"));
    expect(buildPdfFragmentId("abc", anchor, "hello")).not.toBe(buildPdfFragmentId("abc", anchor, "world"));
  });
});

describe("PDF drafts and durable finalize", () => {
  it("requires page-linked approved sources and persists digital-only snapshot", async () => {
    const bytes = loadFixture();
    const extracted = await extractSpecificationPdf(bytes, "aec-building-requirements.pdf");
    expect(extracted.success).toBe(true);
    if (!extracted.success) return;

    let drafts = createInitialPdfDrafts(extracted.data);
    expect(confirmationBlockers(drafts).length).toBeGreaterThan(0);

    drafts = drafts.map((draft) => {
      if (draft.superseded || !draft.included) {
        return draft.kind === "candidate"
          ? { ...draft, decision: "accepted" as const, reviewed: true, included: false, kind: "excluded" as const, status: "excluded" as const }
          : draft;
      }
      return approvePdfDraftSource(draft, "tester", true);
    });

    const finalized = finalizePdfImport("Riverside PDF", "A", extracted.data, drafts);
    expect(finalized.success).toBe(true);
    if (!finalized.success) return;
    expect(finalized.data.documentSource?.kind).toBe("pdf");
    if (finalized.data.documentSource?.kind !== "pdf") return;
    expect(finalized.data.documentSource.extractionMode).toBe("digital_text_only");
    expect(finalized.data.documentSource.ocr.enabled).toBe(false);
    expect(finalized.data.documentSource.fragments.every((fragment) => fragment.ocrConfidence === undefined)).toBe(true);
    expect(finalized.data.requirements.every((requirement) => /^page-\d+$/.test(requirement.source?.section ?? ""))).toBe(true);
    expect(finalized.data.requirements.every((requirement) => requirement.sourceApproval?.status === "approved")).toBe(true);
  });

  it("rejects packages that try to mix OCR confidence into digital-text mode", async () => {
    const bytes = loadFixture();
    const extracted = await extractSpecificationPdf(bytes, "aec-building-requirements.pdf");
    expect(extracted.success).toBe(true);
    if (!extracted.success) return;
    const poisoned = {
      ...extracted.data,
      fragments: extracted.data.fragments.map((fragment, index) =>
        index === 0 ? { ...fragment, ocrConfidence: 0.4 } : fragment
      )
    };
    const drafts = createInitialPdfDrafts(extracted.data).map((draft) =>
      draft.included ? approvePdfDraftSource(draft, "tester", true) : draft
    );
    const finalized = finalizePdfImport("Bad", "A", poisoned, drafts);
    expect(finalized.success).toBe(false);
  });
});
