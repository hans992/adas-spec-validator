import { createHash } from "node:crypto";

import { XMLParser } from "fast-xml-parser";
import JSZip from "jszip";

import type {
  DocumentFragment,
  DocumentFragmentKind,
  DocumentSourceSnapshot,
  DocxSourceAnchor
} from "@/domain/types";

export const DOCX_PARSER_VERSION = "1.0.0";

export const DOCX_LIMITS = {
  maxFileBytes: 15 * 1024 * 1024,
  maxUncompressedBytes: 60 * 1024 * 1024,
  maxCompressionRatio: 100,
  maxZipEntries: 800,
  maxXmlEntryBytes: 12 * 1024 * 1024,
  maxXmlNodes: 250_000,
  maxXmlDepth: 64,
  maxFragments: 20_000,
  parseTimeoutMs: 10_000
} as const;

export type DocxLanguage = "en" | "de" | "hr" | "unknown";

export interface UnsupportedContentNotice {
  kind: string;
  count: number;
  message: string;
}

export interface DocxExtraction {
  safeFileName: string;
  contentHash: string;
  parserVersion: string;
  language: DocxLanguage;
  metadata: DocumentSourceSnapshot["metadata"];
  fragments: DocumentFragment[];
  unsupportedContent: UnsupportedContentNotice[];
  trackChanges: DocumentSourceSnapshot["trackChanges"];
  warnings: string[];
}

export type DocxExtractionResult =
  | { success: true; data: DocxExtraction }
  | { success: false; error: string };

type ZipInspection = {
  entryCount: number;
  compressedBytes: number;
  uncompressedBytes: number;
  names: string[];
};

type TextPiece = {
  text: string;
  inserted: boolean;
};

type NumberingState = {
  abstractByNumId: Map<string, string>;
  formatByAbstract: Map<string, Map<number, string>>;
  counters: Map<string, number[]>;
};

const MANDATORY_PATTERNS: Record<Exclude<DocxLanguage, "unknown">, RegExp[]> = {
  en: [
    /\bshall\b/i,
    /\bmust\b/i,
    /\bis required to\b/i,
    /\brequired to\b/i,
    /\bshall not\b/i
  ],
  de: [
    /\bmuss\b/i,
    /\bmüssen\b/i,
    /\bdarf nicht\b/i,
    /\bist erforderlich\b/i,
    /\bist\b[\s\S]{0,40}\bsicherzustellen\b/i
  ],
  hr: [
    /\bmora\b/i,
    /\bmoraju\b/i,
    /\bnije dopušteno\b/i,
    /\bobavezno\b/i
  ]
};

function sanitizeFileName(fileName: string): string {
  const base = fileName.replace(/^.*[\\/]/, "").replace(/[\u0000-\u001f<>:"/\\|?*]/g, "_").trim();
  return (base || "specification.docx").slice(0, 180);
}

function inspectZip(buffer: ArrayBuffer): ZipInspection {
  const view = new DataView(buffer);
  const decoder = new TextDecoder();
  const names: string[] = [];
  let compressedBytes = 0;
  let uncompressedBytes = 0;
  let entryCount = 0;

  for (let offset = 0; offset <= view.byteLength - 46;) {
    if (view.getUint32(offset, true) !== 0x02014b50) {
      offset += 1;
      continue;
    }
    const compressed = view.getUint32(offset + 20, true);
    const uncompressed = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const recordLength = 46 + nameLength + extraLength + commentLength;
    if (offset + recordLength > view.byteLength) throw new Error("The DOCX ZIP directory is malformed.");
    names.push(decoder.decode(new Uint8Array(buffer, offset + 46, nameLength)));
    compressedBytes += compressed;
    uncompressedBytes += uncompressed;
    entryCount += 1;
    if (entryCount > DOCX_LIMITS.maxZipEntries) {
      throw new Error(`DOCX contains more than ${DOCX_LIMITS.maxZipEntries} ZIP entries.`);
    }
    if (uncompressedBytes > DOCX_LIMITS.maxUncompressedBytes) {
      throw new Error("DOCX expands beyond the 60 MB safety limit.");
    }
    offset += recordLength;
  }
  if (entryCount === 0) throw new Error("The file is not a valid DOCX ZIP archive.");
  if (compressedBytes > 0 && uncompressedBytes / compressedBytes > DOCX_LIMITS.maxCompressionRatio) {
    throw new Error("DOCX compression ratio exceeds the ZIP-bomb safety limit.");
  }
  return { entryCount, compressedBytes, uncompressedBytes, names };
}

export async function sha256Hex(input: ArrayBuffer | string): Promise<string> {
  const data = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  if (typeof globalThis.crypto?.subtle?.digest === "function") {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return createHash("sha256").update(Buffer.from(data)).digest("hex");
}

export function buildFragmentId(documentHash: string, anchor: DocxSourceAnchor, exactText: string): string {
  const payload = `${documentHash}|${JSON.stringify(anchor)}|${exactText}`;
  const digest = createHash("sha256").update(payload).digest("hex");
  return `frag_${digest.slice(0, 24)}`;
}

export function validateDocxEnvelope(
  buffer: ArrayBuffer,
  fileName: string,
  mimeType = ""
): { success: true; safeFileName: string } | { success: false; error: string } {
  const safeFileName = sanitizeFileName(fileName);
  if (!safeFileName.toLowerCase().endsWith(".docx")) {
    return { success: false, error: "Only macro-free .docx files are accepted." };
  }
  if (buffer.byteLength === 0 || buffer.byteLength > DOCX_LIMITS.maxFileBytes) {
    return { success: false, error: "DOCX must be non-empty and no larger than 15 MB." };
  }
  const bytes = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) {
    return { success: false, error: "DOCX magic bytes are invalid." };
  }
  const allowedMimes = new Set([
    "",
    "application/octet-stream",
    "application/zip",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ]);
  if (!allowedMimes.has(mimeType)) {
    return { success: false, error: `Unsupported DOCX MIME type: ${mimeType}` };
  }
  try {
    const zip = inspectZip(buffer);
    const lowerNames = zip.names.map((name) => name.replace(/\\/g, "/").toLowerCase());
    if (!lowerNames.includes("[content_types].xml")) {
      return { success: false, error: "DOCX is missing [Content_Types].xml." };
    }
    if (!lowerNames.some((name) => name === "word/document.xml" || name.endsWith("/word/document.xml"))) {
      return { success: false, error: "DOCX is missing word/document.xml." };
    }
    if (!lowerNames.some((name) => name === "_rels/.rels" || name.endsWith("/_rels/.rels"))) {
      return { success: false, error: "DOCX is missing package relationships." };
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "DOCX ZIP inspection failed." };
  }
  return { success: true, safeFileName };
}

function assertSafeXml(xml: string, entryName: string): void {
  if (xml.length > DOCX_LIMITS.maxXmlEntryBytes) {
    throw new Error(`${entryName} exceeds the per-entry XML size limit.`);
  }
  if (/<!DOCTYPE/i.test(xml) || /<!ENTITY/i.test(xml) || /SYSTEM\s+["']/i.test(xml)) {
    throw new Error(`${entryName} contains disallowed DTD or external entity declarations.`);
  }
}

function createXmlParser(): XMLParser {
  return new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    processEntities: false,
    htmlEntities: false,
    trimValues: false,
    allowBooleanAttributes: true,
    ignoreDeclaration: true,
    ignorePiTags: true,
    removeNSPrefix: false,
    isArray: (name) =>
      [
        "Override",
        "Default",
        "Relationship",
        "w:p",
        "w:r",
        "w:t",
        "w:tbl",
        "w:tr",
        "w:tc",
        "w:hyperlink",
        "w:ins",
        "w:del",
        "w:moveFrom",
        "w:moveTo",
        "w:commentRangeStart",
        "w:footnoteReference",
        "w:endnoteReference",
        "w:drawing",
        "w:object",
        "w:pict",
        "w:txbxContent",
        "w:altChunk",
        "w:lvl",
        "w:abstractNum",
        "w:num",
        "w:sdt",
        "cp:keywords"
      ].includes(name)
  });
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function getAttr(node: Record<string, unknown> | undefined, ...keys: string[]): string | undefined {
  if (!node) return undefined;
  for (const key of keys) {
    const value = node[key];
    if (typeof value === "string" || typeof value === "number") return String(value);
  }
  return undefined;
}

function countNodes(value: unknown, depth = 0, state = { count: 0 }): number {
  if (depth > DOCX_LIMITS.maxXmlDepth) throw new Error("DOCX XML exceeds the maximum nesting depth.");
  state.count += 1;
  if (state.count > DOCX_LIMITS.maxXmlNodes) throw new Error("DOCX XML exceeds the maximum node count.");
  if (Array.isArray(value)) {
    for (const item of value) countNodes(item, depth + 1, state);
  } else if (value && typeof value === "object") {
    for (const child of Object.values(value)) countNodes(child, depth + 1, state);
  }
  return state.count;
}

function collectTextPieces(node: unknown, inserted = false, pieces: TextPiece[] = []): TextPiece[] {
  if (node == null) return pieces;
  if (typeof node === "string" || typeof node === "number") {
    pieces.push({ text: String(node), inserted });
    return pieces;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectTextPieces(item, inserted, pieces);
    return pieces;
  }
  if (typeof node !== "object") return pieces;
  const record = node as Record<string, unknown>;

  if ("w:t" in record) {
    for (const textNode of asArray(record["w:t"])) {
      if (typeof textNode === "string" || typeof textNode === "number") {
        pieces.push({ text: String(textNode), inserted });
      } else if (textNode && typeof textNode === "object") {
        const textRecord = textNode as Record<string, unknown>;
        const text = textRecord["#text"];
        if (text != null) pieces.push({ text: String(text), inserted });
      }
    }
  }
  if ("w:tab" in record) pieces.push({ text: "\t", inserted });
  if ("w:br" in record || "w:cr" in record) pieces.push({ text: "\n", inserted });

  const skipKeys = new Set([
    "w:t",
    "w:del",
    "w:moveFrom",
    "w:delText",
    "w:txbxContent",
    "w:drawing",
    "w:object",
    "w:pict",
    "w:altChunk",
    "w:footnoteReference",
    "w:endnoteReference",
    "w:commentRangeStart",
    "w:commentRangeEnd",
    "w:commentReference"
  ]);

  for (const [key, value] of Object.entries(record)) {
    if (key.startsWith("@_") || key === "#text") continue;
    if (skipKeys.has(key)) continue;
    if (key === "w:ins" || key === "w:moveTo") {
      for (const child of asArray(value)) collectTextPieces(child, true, pieces);
      continue;
    }
    collectTextPieces(value, inserted, pieces);
  }
  return pieces;
}

function joinPieces(pieces: TextPiece[]): { text: string; revisionContent: boolean } {
  const text = pieces.map((piece) => piece.text).join("").replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").trim();
  return { text, revisionContent: pieces.some((piece) => piece.inserted && piece.text.trim().length > 0) };
}

function detectLanguage(texts: string[], preferred?: string): DocxLanguage {
  if (preferred === "en" || preferred === "de" || preferred === "hr") return preferred;
  const sample = texts.slice(0, 80).join("\n");
  const scores: Record<Exclude<DocxLanguage, "unknown">, number> = { en: 0, de: 0, hr: 0 };
  for (const [language, patterns] of Object.entries(MANDATORY_PATTERNS) as Array<[Exclude<DocxLanguage, "unknown">, RegExp[]]>) {
    for (const pattern of patterns) {
      if (pattern.test(sample)) scores[language] += 2;
    }
  }
  if (/\b(the|shall|must|and|with)\b/i.test(sample)) scores.en += 1;
  if (/\b(und|oder|der|die|das|muss|nicht)\b/i.test(sample)) scores.de += 2;
  if (/\b(i|te|za|mora|obavezno)\b/i.test(sample)) scores.hr += 1;
  const ranked = (Object.entries(scores) as Array<[Exclude<DocxLanguage, "unknown">, number]>)
    .sort((left, right) => right[1] - left[1]);
  return ranked[0][1] > 0 ? ranked[0][0] : "unknown";
}

function matchesMandatory(text: string, _language: DocxLanguage): string[] {
  const hints: string[] = [];
  for (const code of Object.keys(MANDATORY_PATTERNS) as Array<Exclude<DocxLanguage, "unknown">>) {
    if (MANDATORY_PATTERNS[code].some((pattern) => pattern.test(text))) hints.push(code);
  }
  return hints;
}

function headingLevel(paragraph: Record<string, unknown>): number | null {
  const style = getAttr(
    asArray((paragraph["w:pPr"] as Record<string, unknown> | undefined)?.["w:pStyle"])[0] as Record<string, unknown> | undefined,
    "@_w:val",
    "@_val"
  );
  if (!style) return null;
  const match = /heading\s*([1-9])/i.exec(style) || /^h([1-9])$/i.exec(style);
  return match ? Number(match[1]) : null;
}

function parseNumbering(xml: string | null): NumberingState {
  const state: NumberingState = {
    abstractByNumId: new Map(),
    formatByAbstract: new Map(),
    counters: new Map()
  };
  if (!xml) return state;
  assertSafeXml(xml, "word/numbering.xml");
  const parsed = createXmlParser().parse(xml) as Record<string, unknown>;
  countNodes(parsed);
  const root = (parsed["w:numbering"] ?? parsed.numbering) as Record<string, unknown> | undefined;
  if (!root) return state;
  for (const abstract of asArray(root["w:abstractNum"])) {
    const abstractId = getAttr(abstract as Record<string, unknown>, "@_w:abstractNumId", "@_abstractNumId");
    if (!abstractId) continue;
    const formats = new Map<number, string>();
    for (const level of asArray((abstract as Record<string, unknown>)["w:lvl"])) {
      const levelRecord = level as Record<string, unknown>;
      const ilvl = Number(getAttr(levelRecord, "@_w:ilvl", "@_ilvl") ?? "0");
      const numFmt = getAttr(
        asArray(levelRecord["w:numFmt"])[0] as Record<string, unknown> | undefined,
        "@_w:val",
        "@_val"
      ) ?? "decimal";
      formats.set(ilvl, numFmt);
    }
    state.formatByAbstract.set(abstractId, formats);
  }
  for (const num of asArray(root["w:num"])) {
    const numId = getAttr(num as Record<string, unknown>, "@_w:numId", "@_numId");
    const abstractId = getAttr(
      asArray((num as Record<string, unknown>)["w:abstractNumId"])[0] as Record<string, unknown> | undefined,
      "@_w:val",
      "@_val"
    );
    if (numId && abstractId) state.abstractByNumId.set(numId, abstractId);
  }
  return state;
}

function nextNumberLabel(state: NumberingState, numId: string, ilvl: number): string {
  const counters = state.counters.get(numId) ?? [];
  while (counters.length <= ilvl) counters.push(0);
  counters[ilvl] += 1;
  for (let index = ilvl + 1; index < counters.length; index += 1) counters[index] = 0;
  state.counters.set(numId, counters);
  return counters.slice(0, ilvl + 1).join(".");
}

function paragraphNumbering(
  paragraph: Record<string, unknown>,
  numbering: NumberingState
): { label?: string; bullet: boolean } {
  const numPr = asArray((paragraph["w:pPr"] as Record<string, unknown> | undefined)?.["w:numPr"])[0] as
    | Record<string, unknown>
    | undefined;
  if (!numPr) return { bullet: false };
  const numId = getAttr(asArray(numPr["w:numId"])[0] as Record<string, unknown> | undefined, "@_w:val", "@_val");
  const ilvl = Number(getAttr(asArray(numPr["w:ilvl"])[0] as Record<string, unknown> | undefined, "@_w:val", "@_val") ?? "0");
  if (!numId) return { bullet: false };
  const abstractId = numbering.abstractByNumId.get(numId);
  const format = abstractId ? numbering.formatByAbstract.get(abstractId)?.get(ilvl) : undefined;
  if (format === "bullet") return { bullet: true, label: "•" };
  return { bullet: false, label: nextNumberLabel(numbering, numId, ilvl) };
}

function countUnsupported(node: unknown, counts: Map<string, number>): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) countUnsupported(item, counts);
    return;
  }
  const record = node as Record<string, unknown>;
  const bump = (kind: string, amount = 1) => counts.set(kind, (counts.get(kind) ?? 0) + amount);
  if ("w:txbxContent" in record) bump("text_box", asArray(record["w:txbxContent"]).length);
  if ("w:object" in record) bump("embedded_object", asArray(record["w:object"]).length);
  if ("w:pict" in record) bump("vml_picture", asArray(record["w:pict"]).length);
  if ("w:altChunk" in record) bump("alt_chunk", asArray(record["w:altChunk"]).length);
  if ("w:footnoteReference" in record) bump("footnote", asArray(record["w:footnoteReference"]).length);
  if ("w:endnoteReference" in record) bump("endnote", asArray(record["w:endnoteReference"]).length);
  if ("w:sdt" in record) bump("content_control", asArray(record["w:sdt"]).length);
  if ("w:drawing" in record) bump("drawing", asArray(record["w:drawing"]).length);
  for (const value of Object.values(record)) countUnsupported(value, counts);
}

function countTrackMarkers(node: unknown, state: { inserted: number; deleted: number; comments: number }): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) countTrackMarkers(item, state);
    return;
  }
  const record = node as Record<string, unknown>;
  state.inserted += asArray(record["w:ins"]).length + asArray(record["w:moveTo"]).length;
  state.deleted += asArray(record["w:del"]).length + asArray(record["w:moveFrom"]).length;
  state.comments += asArray(record["w:commentRangeStart"]).length;
  for (const value of Object.values(record)) countTrackMarkers(value, state);
}

function classifyFragment(
  text: string,
  options: {
    headingLvl: number | null;
    numberingLabel?: string;
    bullet: boolean;
    inTable: boolean;
    language: DocxLanguage;
  }
): DocumentFragmentKind {
  if (options.headingLvl === 1) return "heading";
  if (options.headingLvl != null) return "subheading";
  if (options.inTable) return "table_cell";
  if (options.bullet) return "bullet_item";
  if (options.numberingLabel) return "numbered_clause";
  if (matchesMandatory(text, options.language).length > 0) return "mandatory_candidate";
  return "paragraph";
}

async function readZipText(zip: JSZip, path: string): Promise<string | null> {
  const file = zip.file(path) ?? zip.file(path.replace(/^\//, ""));
  if (!file) return null;
  const text = await file.async("string");
  assertSafeXml(text, path);
  return text;
}

function readCoreMetadata(xml: string | null): DocumentSourceSnapshot["metadata"] {
  if (!xml) return {};
  assertSafeXml(xml, "docProps/core.xml");
  const parsed = createXmlParser().parse(xml) as Record<string, unknown>;
  countNodes(parsed);
  const core = (parsed["cp:coreProperties"] ?? parsed.coreProperties) as Record<string, unknown> | undefined;
  if (!core) return {};
  const textOf = (key: string): string | undefined => {
    const value = core[key];
    if (typeof value === "string") return value.trim() || undefined;
    if (value && typeof value === "object" && "#text" in (value as object)) {
      return String((value as Record<string, unknown>)["#text"]).trim() || undefined;
    }
    return undefined;
  };
  return {
    ...(textOf("dc:title") ? { title: textOf("dc:title") } : {}),
    ...(textOf("dc:creator") ? { creator: textOf("dc:creator") } : {}),
    ...(textOf("dc:subject") ? { subject: textOf("dc:subject") } : {}),
    ...(textOf("dc:description") ? { description: textOf("dc:description") } : {}),
    ...(textOf("cp:lastModifiedBy") ? { lastModifiedBy: textOf("cp:lastModifiedBy") } : {}),
    ...(textOf("dcterms:created") ? { created: textOf("dcterms:created") } : {}),
    ...(textOf("dcterms:modified") ? { modified: textOf("dcterms:modified") } : {})
  };
}

function pushFragment(
  fragments: DocumentFragment[],
  documentHash: string,
  partial: Omit<DocumentFragment, "fragmentId">
): void {
  if (!partial.exactText.trim()) return;
  if (fragments.length >= DOCX_LIMITS.maxFragments) {
    throw new Error(`DOCX produced more than ${DOCX_LIMITS.maxFragments} fragments.`);
  }
  fragments.push({
    ...partial,
    fragmentId: buildFragmentId(documentHash, partial.sourceAnchor, partial.exactText)
  });
}

function walkBody(
  body: Record<string, unknown>,
  documentHash: string,
  language: DocxLanguage,
  numbering: NumberingState,
  fragments: DocumentFragment[]
): void {
  const children = [
    ...asArray(body["w:p"]).map((node) => ({ type: "p" as const, node })),
    ...asArray(body["w:tbl"]).map((node) => ({ type: "tbl" as const, node }))
  ];
  // Preserve approximate document order by scanning keys in insertion order when possible.
  const ordered: Array<{ type: "p" | "tbl"; node: unknown }> = [];
  for (const [key, value] of Object.entries(body)) {
    if (key === "w:p") for (const node of asArray(value)) ordered.push({ type: "p", node });
    if (key === "w:tbl") for (const node of asArray(value)) ordered.push({ type: "tbl", node });
  }
  const sequence = ordered.length > 0 ? ordered : children;
  let paragraphIndex = 0;
  let tableIndex = 0;
  let bodyIndex = 0;
  const headingPath: string[] = [];

  for (const item of sequence) {
    if (item.type === "p") {
      const paragraph = item.node as Record<string, unknown>;
      const pieces = collectTextPieces(paragraph);
      const { text, revisionContent } = joinPieces(pieces);
      const level = headingLevel(paragraph);
      const numberingInfo = paragraphNumbering(paragraph, numbering);
      if (level != null && text) {
        headingPath.splice(level - 1);
        headingPath[level - 1] = text;
      }
      const kind = classifyFragment(text, {
        headingLvl: level,
        numberingLabel: numberingInfo.label,
        bullet: numberingInfo.bullet,
        inTable: false,
        language
      });
      const languageHints = matchesMandatory(text, language);
      const anchor: DocxSourceAnchor = {
        kind: "paragraph",
        bodyIndex,
        paragraphIndex,
        startOffset: 0,
        endOffset: text.length
      };
      pushFragment(fragments, documentHash, {
        kind: languageHints.length > 0 && kind === "paragraph" ? "mandatory_candidate" : kind,
        exactText: text,
        ...(numberingInfo.label ? { numberingLabel: numberingInfo.label } : {}),
        headingPath: [...headingPath],
        sourceAnchor: anchor,
        ...(revisionContent ? { revisionContent: true } : {}),
        ...(languageHints.length > 0 ? { languageHints } : {})
      });
      paragraphIndex += 1;
      bodyIndex += 1;
      continue;
    }

    const table = item.node as Record<string, unknown>;
    let rowIndex = 0;
    for (const row of asArray(table["w:tr"])) {
      let cellIndex = 0;
      for (const cell of asArray((row as Record<string, unknown>)["w:tc"])) {
        let cellParagraphIndex = 0;
        for (const cellParagraph of asArray((cell as Record<string, unknown>)["w:p"])) {
          const pieces = collectTextPieces(cellParagraph);
          const { text, revisionContent } = joinPieces(pieces);
          const languageHints = matchesMandatory(text, language);
          const anchor: DocxSourceAnchor = {
            kind: "table_cell",
            tableIndex,
            rowIndex,
            cellIndex,
            paragraphIndex: cellParagraphIndex,
            startOffset: 0,
            endOffset: text.length
          };
          pushFragment(fragments, documentHash, {
            kind: languageHints.length > 0 ? "mandatory_candidate" : "table_cell",
            exactText: text,
            headingPath: [...headingPath],
            tableRef: { tableIndex, rowIndex, cellIndex },
            sourceAnchor: anchor,
            ...(revisionContent ? { revisionContent: true } : {}),
            ...(languageHints.length > 0 ? { languageHints } : {})
          });
          cellParagraphIndex += 1;
        }
        cellIndex += 1;
      }
      rowIndex += 1;
    }
    tableIndex += 1;
    bodyIndex += 1;
  }
}

function unsupportedNotices(
  counts: Map<string, number>,
  hasHeaders: boolean,
  hasFooters: boolean,
  relationshipWarnings: string[]
): UnsupportedContentNotice[] {
  const notices: UnsupportedContentNotice[] = [];
  const messages: Record<string, string> = {
    text_box: "Text boxes were not extracted as requirement candidates.",
    embedded_object: "Embedded objects were not extracted.",
    vml_picture: "Legacy pictures/objects were not OCR-extracted.",
    alt_chunk: "altChunk HTML/document content was not extracted.",
    footnote: "Footnotes were detected and not converted into requirements.",
    endnote: "Endnotes were detected and not converted into requirements.",
    content_control: "Content controls were partially flattened; review carefully.",
    drawing: "Drawings/images may contain text that was not extracted."
  };
  for (const [kind, count] of counts) {
    if (count <= 0) continue;
    notices.push({
      kind,
      count,
      message: messages[kind] ?? `${kind} content was not fully extracted.`
    });
  }
  if (hasHeaders) {
    notices.push({
      kind: "header",
      count: 1,
      message: "Headers were detected and are not imported as requirements."
    });
  }
  if (hasFooters) {
    notices.push({
      kind: "footer",
      count: 1,
      message: "Footers were detected and are not imported as requirements."
    });
  }
  for (const warning of relationshipWarnings) {
    notices.push({ kind: "external_relationship", count: 1, message: warning });
  }
  return notices;
}

function inspectRelationships(xml: string | null): string[] {
  if (!xml) return [];
  assertSafeXml(xml, "word/_rels/document.xml.rels");
  const parsed = createXmlParser().parse(xml) as Record<string, unknown>;
  countNodes(parsed);
  const root = (parsed.Relationships ?? parsed.relationships) as Record<string, unknown> | undefined;
  const warnings: string[] = [];
  for (const rel of asArray(root?.Relationship ?? root?.relationship)) {
    const target = getAttr(rel as Record<string, unknown>, "@_Target", "@_target") ?? "";
    if (/^https?:\/\//i.test(target) || /^file:/i.test(target)) {
      warnings.push(`External relationship target was ignored and never fetched: ${target.slice(0, 120)}`);
    }
  }
  return warnings;
}

export async function extractSpecificationDocx(
  buffer: ArrayBuffer,
  fileName: string,
  mimeType = "",
  options?: { language?: DocxLanguage }
): Promise<DocxExtractionResult> {
  const envelope = validateDocxEnvelope(buffer, fileName, mimeType);
  if (!envelope.success) return envelope;

  const started = Date.now();
  try {
    const contentHash = await sha256Hex(buffer);
    const zip = await JSZip.loadAsync(buffer, { checkCRC32: true });
    if (Date.now() - started > DOCX_LIMITS.parseTimeoutMs) {
      return { success: false, error: "DOCX parsing exceeded the safety timeout." };
    }

    const documentXml = await readZipText(zip, "word/document.xml");
    if (!documentXml) return { success: false, error: "DOCX is missing word/document.xml." };
    const numberingXml = await readZipText(zip, "word/numbering.xml");
    const coreXml = await readZipText(zip, "docProps/core.xml");
    const relsXml = await readZipText(zip, "word/_rels/document.xml.rels");
    const commentsXml = await readZipText(zip, "word/comments.xml");

    const documentParsed = createXmlParser().parse(documentXml) as Record<string, unknown>;
    countNodes(documentParsed);
    const document = (documentParsed["w:document"] ?? documentParsed.document) as Record<string, unknown> | undefined;
    const body = (document?.["w:body"] ?? document?.body) as Record<string, unknown> | undefined;
    if (!body) return { success: false, error: "DOCX document body is missing." };

    const unsupportedCounts = new Map<string, number>();
    countUnsupported(body, unsupportedCounts);
    const trackState = { inserted: 0, deleted: 0, comments: 0 };
    countTrackMarkers(body, trackState);
    if (commentsXml) {
      assertSafeXml(commentsXml, "word/comments.xml");
      const commentsParsed = createXmlParser().parse(commentsXml) as Record<string, unknown>;
      countNodes(commentsParsed);
      const commentsRoot = (commentsParsed["w:comments"] ?? commentsParsed.comments) as Record<string, unknown> | undefined;
      trackState.comments = Math.max(
        trackState.comments,
        asArray(commentsRoot?.["w:comment"] ?? commentsRoot?.comment).length
      );
    }

    const preliminaryTexts: string[] = [];
    for (const paragraph of asArray(body["w:p"])) {
      preliminaryTexts.push(joinPieces(collectTextPieces(paragraph)).text);
    }
    const language = detectLanguage(preliminaryTexts, options?.language);
    const numbering = parseNumbering(numberingXml);
    const fragments: DocumentFragment[] = [];
    walkBody(body, contentHash, language, numbering, fragments);

    const hasHeaders = Object.keys(zip.files).some((name) => /word\/header\d*\.xml$/i.test(name));
    const hasFooters = Object.keys(zip.files).some((name) => /word\/footer\d*\.xml$/i.test(name));
    const relationshipWarnings = inspectRelationships(relsXml);
    const unsupportedContent = unsupportedNotices(unsupportedCounts, hasHeaders, hasFooters, relationshipWarnings);
    const trackPresent = trackState.inserted > 0 || trackState.deleted > 0 || trackState.comments > 0;
    const warnings: string[] = [];
    if (trackPresent) {
      warnings.push(
        "Unresolved Track Changes or comments were detected. Inserted text is included and marked; deleted text is not treated as active requirements; comments are never auto-converted."
      );
    }
    for (const notice of unsupportedContent) {
      warnings.push(`Unsupported content detected: ${notice.count} ${notice.kind.replace(/_/g, " ")} — ${notice.message}`);
    }
    if (Date.now() - started > DOCX_LIMITS.parseTimeoutMs) {
      return { success: false, error: "DOCX parsing exceeded the safety timeout." };
    }

    return {
      success: true,
      data: {
        safeFileName: envelope.safeFileName,
        contentHash,
        parserVersion: DOCX_PARSER_VERSION,
        language,
        metadata: readCoreMetadata(coreXml),
        fragments,
        unsupportedContent,
        trackChanges: {
          present: trackPresent,
          insertedRuns: trackState.inserted,
          deletedRuns: trackState.deleted,
          comments: trackState.comments,
          ...(trackPresent
            ? {
                warning:
                  "Document contains unresolved revisions or comments. Review carefully before confirmation."
              }
            : {})
        },
        warnings
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "DOCX extraction failed."
    };
  }
}
