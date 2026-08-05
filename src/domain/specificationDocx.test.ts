import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildFragmentId,
  extractSpecificationDocx,
  sha256Hex,
  validateDocxEnvelope
} from "@/domain/specificationDocx";
import {
  approveDraftSource,
  confirmationBlockers,
  createInitialDrafts,
  finalizeDocxImport,
  mergeDrafts,
  splitDraft,
  validateCitationQuotes
} from "@/domain/specificationDocxDrafts";
import JSZip from "jszip";

const fixturePath = path.join(process.cwd(), "test/fixtures/aec-building-requirements.docx");

async function loadFixture(): Promise<ArrayBuffer> {
  const buffer = readFileSync(fixturePath);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

describe("DOCX envelope and extraction", () => {
  it("rejects non-docx names and invalid envelopes", async () => {
    const bytes = await loadFixture();
    expect(validateDocxEnvelope(bytes, "spec.doc").success).toBe(false);
    expect(validateDocxEnvelope(new ArrayBuffer(8), "spec.docx").success).toBe(false);
  });

  it("extracts headings, numbering, tables, German mandatory phrasing, and warnings", async () => {
    const bytes = await loadFixture();
    const first = await extractSpecificationDocx(bytes, "aec-building-requirements.docx");
    expect(first.success).toBe(true);
    if (!first.success) return;

    expect(first.data.metadata.title).toContain("Riverside");
    expect(first.data.fragments.some((fragment) => fragment.kind === "heading")).toBe(true);
    expect(first.data.fragments.some((fragment) => fragment.kind === "numbered_clause")).toBe(true);
    expect(first.data.fragments.some((fragment) => fragment.kind === "table_cell")).toBe(true);
    expect(first.data.fragments.some((fragment) => fragment.exactText.includes("müssen"))).toBe(true);
    expect(first.data.fragments.some((fragment) => fragment.revisionContent)).toBe(true);
    expect(first.data.fragments.some((fragment) => /deleted obsolete/.test(fragment.exactText))).toBe(false);
    expect(first.data.trackChanges.present).toBe(true);
    expect(first.data.unsupportedContent.some((item) => item.kind === "text_box")).toBe(true);
    expect(first.data.unsupportedContent.some((item) => item.kind === "footnote")).toBe(true);
    expect(first.data.unsupportedContent.some((item) => item.kind === "embedded_object")).toBe(true);
    expect(first.data.warnings.some((warning) => /External relationship/.test(warning))).toBe(true);

    const second = await extractSpecificationDocx(bytes, "aec-building-requirements.docx");
    expect(second.success).toBe(true);
    if (!second.success) return;
    expect(second.data.contentHash).toBe(first.data.contentHash);
    expect(second.data.fragments.map((fragment) => fragment.fragmentId))
      .toEqual(first.data.fragments.map((fragment) => fragment.fragmentId));
  });

  it("builds deterministic fragment ids from hash+anchor+text", async () => {
    const hash = await sha256Hex("demo");
    const anchor = {
      kind: "paragraph" as const,
      bodyIndex: 0,
      paragraphIndex: 1,
      startOffset: 0,
      endOffset: 5
    };
    expect(buildFragmentId(hash, anchor, "hello")).toBe(buildFragmentId(hash, anchor, "hello"));
    expect(buildFragmentId(hash, anchor, "hello")).not.toBe(buildFragmentId(hash, anchor, "world"));
  });

  it("rejects DTD and oversized XML entry content", async () => {
    const zip = new JSZip();
    zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>`);
    zip.folder("_rels")?.file(".rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`);
    zip.folder("word")?.file(
      "document.xml",
      `<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>&xxe;</w:t></w:r></w:p></w:body></w:document>`
    );
    const buffer = await zip.generateAsync({ type: "arraybuffer" });
    const result = await extractSpecificationDocx(buffer, "evil.docx");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/DTD|entity/i);
  });
});

describe("DOCX drafts, merge/split, and durable finalize", () => {
  it("requires approved sources only for included requirements and persists fragment snapshot", async () => {
    const bytes = await loadFixture();
    const extracted = await extractSpecificationDocx(bytes, "aec-building-requirements.docx");
    expect(extracted.success).toBe(true);
    if (!extracted.success) return;

    let drafts = createInitialDrafts(extracted.data);
    expect(confirmationBlockers(drafts).length).toBeGreaterThan(0);

    drafts = drafts.map((draft) => {
      if (draft.superseded || !draft.included) {
        return draft.kind === "informational" || draft.kind === "candidate"
          ? { ...draft, decision: "accepted", reviewed: true, included: false, kind: "excluded", status: "excluded" as const }
          : draft;
      }
      return approveDraftSource(draft, "tester", true);
    });

    const finalized = finalizeDocxImport("Riverside DOCX", "A", extracted.data, drafts);
    expect(finalized.success).toBe(true);
    if (!finalized.success) return;
    expect(finalized.data.documentSource?.contentHash).toBe(extracted.data.contentHash);
    expect(finalized.data.documentSource?.fragments.length).toBe(extracted.data.fragments.length);
    expect(finalized.data.documentSource?.fragmentRequirementMap.length).toBe(finalized.data.requirements.length);
    expect(finalized.data.requirements.every((requirement) => requirement.sourceApproval?.status === "approved")).toBe(true);
    expect(finalized.data.requirements.every((requirement) => (requirement.sourceFragmentIds?.length ?? 0) > 0)).toBe(true);
  });

  it("preserves ordered sources on merge and character ranges on split", async () => {
    const bytes = await loadFixture();
    const extracted = await extractSpecificationDocx(bytes, "aec-building-requirements.docx");
    expect(extracted.success).toBe(true);
    if (!extracted.success) return;
    let drafts = createInitialDrafts(extracted.data);
    const candidates = drafts.filter((draft) => draft.kind === "candidate" && !draft.superseded);
    expect(candidates.length).toBeGreaterThan(1);

    drafts = mergeDrafts(drafts, [candidates[0].draftId, candidates[1].draftId], "tester");
    const merged = drafts.find((draft) => draft.mergedFromDraftIds?.length === 2);
    expect(merged).toBeTruthy();
    expect(merged?.fragmentIds).toEqual([...new Set([...candidates[0].fragmentIds, ...candidates[1].fragmentIds])]);
    expect(drafts.find((draft) => draft.draftId === candidates[0].draftId)?.superseded).toBe(true);

    const splitSource = createInitialDrafts(extracted.data).find((draft) =>
      draft.description.includes("Split candidate")
    );
    expect(splitSource).toBeTruthy();
    if (!splitSource) return;
    const splitOffset = splitSource.description.indexOf("Second");
    const splitDrafts = splitDraft(createInitialDrafts(extracted.data), splitSource.draftId, splitOffset, "tester");
    const left = splitDrafts.find((draft) => draft.draftId.endsWith("-a"));
    const right = splitDrafts.find((draft) => draft.draftId.endsWith("-b"));
    expect(left?.textRanges[0].exactText).toContain("First sentence");
    expect(right?.textRanges[0].exactText).toContain("Second sentence");
    expect(left?.textRanges[0].fragmentId).toBe(right?.textRanges[0].fragmentId);
    expect(left?.textRanges[0].endOffset).toBeLessThanOrEqual(right?.textRanges[0].startOffset ?? 0);
    expect(splitDrafts.find((draft) => draft.draftId === splitSource.draftId)?.superseded).toBe(true);
  });

  it("rejects AI citations with wrong fragment id or mismatched offsets", async () => {
    const bytes = await loadFixture();
    const extracted = await extractSpecificationDocx(bytes, "aec-building-requirements.docx");
    expect(extracted.success).toBe(true);
    if (!extracted.success) return;
    const fragment = extracted.data.fragments.find((item) => item.exactText.includes("shall provide"))!;
    const good = validateCitationQuotes(extracted.data.fragments, [{
      fragmentId: fragment.fragmentId,
      quotes: [{
        startOffset: 0,
        endOffset: fragment.exactText.length,
        exactText: fragment.exactText
      }]
    }]);
    expect(good).toEqual([]);

    const badId = validateCitationQuotes(extracted.data.fragments, [{
      fragmentId: "frag_missing",
      quotes: [{ startOffset: 0, endOffset: 4, exactText: "Office rooms shall".slice(0, 4) }]
    }]);
    expect(badId.some((error) => /Unknown fragmentId/.test(error))).toBe(true);

    const badOffset = validateCitationQuotes(extracted.data.fragments, [{
      fragmentId: fragment.fragmentId,
      quotes: [{ startOffset: 0, endOffset: 5, exactText: "XXXXX" }]
    }]);
    expect(badOffset.some((error) => /does not match/.test(error))).toBe(true);
  });
});
