import { createHash } from "node:crypto";

import type {
  DocumentFragment,
  DocumentFragmentKind,
  FragmentExtractionQuality,
  PdfPageQuality,
  PdfPageSummary,
  PdfSourceAnchor
} from "@/domain/types";

export const PDF_PARSER_VERSION = "1.0.0";

export const PDF_LIMITS = {
  maxFileBytes: 20 * 1024 * 1024,
  maxPages: 200,
  maxFragments: 20_000,
  maxTextItemsPerPage: 8_000,
  parseTimeoutMs: 15_000,
  /** Pages with fewer chars than this and images present are treated as likely scanned (no OCR in v1). */
  scannedCharThreshold: 40,
  sparseCharThreshold: 120
} as const;

export type PdfLanguage = "en" | "de" | "hr" | "unknown";

export interface UnsupportedContentNotice {
  kind: string;
  count: number;
  message: string;
}

export interface PdfExtraction {
  safeFileName: string;
  contentHash: string;
  parserVersion: string;
  language: PdfLanguage;
  metadata: {
    title?: string;
    creator?: string;
    subject?: string;
    description?: string;
    created?: string;
    modified?: string;
  };
  pageCount: number;
  pages: PdfPageSummary[];
  fragments: DocumentFragment[];
  unsupportedContent: UnsupportedContentNotice[];
  unreliableTableCount: number;
  warnings: string[];
  extractionMode: "digital_text_only";
}

export type PdfExtractionResult =
  | { success: true; data: PdfExtraction }
  | { success: false; error: string };

type TextItem = {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

const MANDATORY_PATTERNS: Record<Exclude<PdfLanguage, "unknown">, RegExp[]> = {
  en: [/\bshall\b/i, /\bmust\b/i, /\bis required to\b/i, /\bshall not\b/i],
  de: [/\bmuss\b/i, /\bmüssen\b/i, /\bdarf nicht\b/i, /\bist erforderlich\b/i],
  hr: [/\bmora\b/i, /\bmoraju\b/i, /\bnije dopušteno\b/i, /\bobavezno\b/i]
};

function sanitizeFileName(fileName: string): string {
  const base = fileName.replace(/^.*[\\/]/, "").replace(/[\u0000-\u001f<>:"/\\|?*]/g, "_").trim();
  return (base || "specification.pdf").slice(0, 180);
}

export async function sha256Hex(input: ArrayBuffer | string): Promise<string> {
  const data = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  if (typeof globalThis.crypto?.subtle?.digest === "function") {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return createHash("sha256").update(Buffer.from(data)).digest("hex");
}

export function buildPdfFragmentId(documentHash: string, anchor: PdfSourceAnchor, exactText: string): string {
  const digest = createHash("sha256")
    .update(`${documentHash}|${JSON.stringify(anchor)}|${exactText}`)
    .digest("hex");
  return `frag_${digest.slice(0, 24)}`;
}

export function validatePdfEnvelope(
  buffer: ArrayBuffer,
  fileName: string,
  mimeType = ""
): { success: true; safeFileName: string } | { success: false; error: string } {
  const safeFileName = sanitizeFileName(fileName);
  if (!safeFileName.toLowerCase().endsWith(".pdf")) {
    return { success: false, error: "Only .pdf files are accepted for PDF import." };
  }
  if (buffer.byteLength === 0 || buffer.byteLength > PDF_LIMITS.maxFileBytes) {
    return { success: false, error: "PDF must be non-empty and no larger than 20 MB." };
  }
  const bytes = new Uint8Array(buffer, 0, Math.min(8, buffer.byteLength));
  const header = String.fromCharCode(...bytes.slice(0, 5));
  if (header !== "%PDF-") {
    return { success: false, error: "PDF header magic bytes are invalid." };
  }
  const allowedMimes = new Set([
    "",
    "application/pdf",
    "application/octet-stream",
    "binary/octet-stream"
  ]);
  if (!allowedMimes.has(mimeType)) {
    return { success: false, error: `Unsupported PDF MIME type: ${mimeType}` };
  }
  // Conservative scan for encryption markers in the raw bytes (not a full PDF parser).
  const sample = new TextDecoder("latin1").decode(new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 512_000)));
  if (/\/Encrypt\b/.test(sample)) {
    return { success: false, error: "Encrypted PDFs are rejected. Export an unencrypted text-based PDF and try again." };
  }
  return { success: true, safeFileName };
}

function matchesMandatory(text: string): string[] {
  const hints: string[] = [];
  for (const code of Object.keys(MANDATORY_PATTERNS) as Array<Exclude<PdfLanguage, "unknown">>) {
    if (MANDATORY_PATTERNS[code].some((pattern) => pattern.test(text))) hints.push(code);
  }
  return hints;
}

function detectLanguage(texts: string[], preferred?: PdfLanguage): PdfLanguage {
  if (preferred && preferred !== "unknown") return preferred;
  const sample = texts.slice(0, 80).join("\n");
  const scores: Record<Exclude<PdfLanguage, "unknown">, number> = { en: 0, de: 0, hr: 0 };
  for (const [language, patterns] of Object.entries(MANDATORY_PATTERNS) as Array<[Exclude<PdfLanguage, "unknown">, RegExp[]]>) {
    for (const pattern of patterns) {
      if (pattern.test(sample)) scores[language] += 2;
    }
  }
  if (/\b(the|shall|must|and|with)\b/i.test(sample)) scores.en += 1;
  if (/\b(und|oder|der|die|das|muss|nicht)\b/i.test(sample)) scores.de += 2;
  if (/\b(i|te|za|mora|obavezno)\b/i.test(sample)) scores.hr += 1;
  const ranked = (Object.entries(scores) as Array<[Exclude<PdfLanguage, "unknown">, number]>)
    .sort((left, right) => right[1] - left[1]);
  return ranked[0][1] > 0 ? ranked[0][0] : "unknown";
}

function classifyLine(text: string): DocumentFragmentKind {
  if (/^\d+(\.\d+)*\s+\S/.test(text) || /^[A-Z]\.\d+/.test(text)) return "numbered_clause";
  if (/^[•\-–—]\s+\S/.test(text)) return "bullet_item";
  if (matchesMandatory(text).length > 0) return "mandatory_candidate";
  if (text.length <= 80 && text === text.toUpperCase() && /[A-Z]/.test(text)) return "heading";
  if (/^(section|chapter|teil|abschnitt)\b/i.test(text) && text.length < 120) return "heading";
  return "paragraph";
}

function pageQuality(charCount: number, textItemCount: number, hasImages: boolean): PdfPageQuality {
  if (charCount === 0 && textItemCount === 0) {
    return hasImages ? "likely_scanned" : "empty";
  }
  if (charCount < PDF_LIMITS.scannedCharThreshold && hasImages) return "likely_scanned";
  if (charCount < PDF_LIMITS.sparseCharThreshold) return "sparse_text";
  return "digital_text";
}

function clusterY(items: TextItem[], tolerance = 3): TextItem[][] {
  const sorted = [...items].sort((left, right) => right.y - left.y || left.x - right.x);
  const lines: TextItem[][] = [];
  for (const item of sorted) {
    const line = lines.find((candidate) => Math.abs(candidate[0].y - item.y) <= tolerance);
    if (line) line.push(item);
    else lines.push([item]);
  }
  for (const line of lines) line.sort((left, right) => left.x - right.x);
  return lines;
}

function joinLine(items: TextItem[]): { text: string; bbox: PdfSourceAnchor extends never ? never : { x: number; y: number; width: number; height: number } } {
  const text = items.map((item) => item.str).join(" ").replace(/\s+/g, " ").trim();
  const minX = Math.min(...items.map((item) => item.x));
  const maxX = Math.max(...items.map((item) => item.x + item.width));
  const minY = Math.min(...items.map((item) => item.y));
  const maxY = Math.max(...items.map((item) => item.y + item.height));
  return {
    text,
    bbox: { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
  };
}

/**
 * Conservative table detection: only when ≥2 rows share ≥2 stable column x-centers.
 * Ambiguous layouts are reported, not forced into cells.
 */
function detectReliableTables(
  lines: Array<{ text: string; bbox: { x: number; y: number; width: number; height: number }; items: TextItem[] }>
): { tables: Array<Array<Array<{ text: string; bbox: { x: number; y: number; width: number; height: number } }>>>; rejected: number } {
  const multi = lines.filter((line) => line.items.length >= 2);
  if (multi.length < 2) return { tables: [], rejected: 0 };

  const columnTolerance = 12;
  const centers = multi.flatMap((line) => line.items.map((item) => item.x + item.width / 2));
  const buckets: number[] = [];
  for (const center of centers.sort((a, b) => a - b)) {
    const bucket = buckets.find((value) => Math.abs(value - center) <= columnTolerance);
    if (bucket == null) buckets.push(center);
  }
  if (buckets.length < 2) return { tables: [], rejected: multi.length > 1 ? 1 : 0 };

  const assignColumn = (x: number, width: number) => {
    const center = x + width / 2;
    let best = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    buckets.forEach((bucket, index) => {
      const distance = Math.abs(bucket - center);
      if (distance < bestDist) {
        best = index;
        bestDist = distance;
      }
    });
    return bestDist <= columnTolerance ? best : -1;
  };

  const rows: Array<Array<{ text: string; bbox: { x: number; y: number; width: number; height: number } } | null>> = [];
  let rejected = 0;
  for (const line of multi) {
    const cells: Array<{ text: string; bbox: { x: number; y: number; width: number; height: number } } | null> =
      buckets.map(() => null);
    let ok = true;
    for (const item of line.items) {
      const column = assignColumn(item.x, item.width);
      if (column < 0) {
        ok = false;
        break;
      }
      const existing = cells[column];
      const piece = { text: item.str.trim(), bbox: { x: item.x, y: item.y, width: item.width, height: item.height } };
      cells[column] = existing
        ? {
            text: `${existing.text} ${piece.text}`.trim(),
            bbox: {
              x: Math.min(existing.bbox.x, piece.bbox.x),
              y: Math.min(existing.bbox.y, piece.bbox.y),
              width: Math.max(existing.bbox.x + existing.bbox.width, piece.bbox.x + piece.bbox.width) - Math.min(existing.bbox.x, piece.bbox.x),
              height: Math.max(existing.bbox.y + existing.bbox.height, piece.bbox.y + piece.bbox.height) - Math.min(existing.bbox.y, piece.bbox.y)
            }
          }
        : piece;
    }
    if (!ok || cells.filter(Boolean).length < 2) {
      rejected += 1;
      continue;
    }
    rows.push(cells);
  }

  if (rows.length < 2) return { tables: [], rejected: rejected + rows.length };
  return { tables: [rows.map((row) => row.filter((cell): cell is NonNullable<typeof cell> => Boolean(cell)))], rejected };
}

async function loadPdfjs() {
  // Prefer legacy build for Node/Vitest; browser bundlers resolve the same package.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjs;
}

export async function extractSpecificationPdf(
  buffer: ArrayBuffer,
  fileName: string,
  mimeType = "",
  options?: { language?: PdfLanguage }
): Promise<PdfExtractionResult> {
  const envelope = validatePdfEnvelope(buffer, fileName, mimeType);
  if (!envelope.success) return envelope;

  const started = Date.now();
  try {
    const contentHash = await sha256Hex(buffer);
    const pdfjs = await loadPdfjs();
    // pdf.js may detach the transferred buffer; always pass a copy.
    const dataCopy = new Uint8Array(buffer.slice(0));
    const loadingTask = pdfjs.getDocument({
      data: dataCopy,
      useSystemFonts: true,
      stopAtErrors: false,
      disableWorker: true,
      isEvalSupported: false
    } as Parameters<typeof pdfjs.getDocument>[0]);
    const pdf = await loadingTask.promise;
    if (pdf.numPages > PDF_LIMITS.maxPages) {
      return { success: false, error: `PDF has more than ${PDF_LIMITS.maxPages} pages.` };
    }

    const meta = await pdf.getMetadata().catch(() => null);
    const info = (meta?.info ?? {}) as Record<string, unknown>;
    const metadata = {
      ...(typeof info.Title === "string" && info.Title.trim() ? { title: info.Title.trim() } : {}),
      ...(typeof info.Author === "string" && info.Author.trim() ? { creator: info.Author.trim() } : {}),
      ...(typeof info.Subject === "string" && info.Subject.trim() ? { subject: info.Subject.trim() } : {}),
      ...(typeof info.CreationDate === "string" ? { created: info.CreationDate } : {}),
      ...(typeof info.ModDate === "string" ? { modified: info.ModDate } : {})
    };

    const pages: PdfPageSummary[] = [];
    const fragments: DocumentFragment[] = [];
    const unsupported: UnsupportedContentNotice[] = [];
    const warnings: string[] = [];
    const allTexts: string[] = [];
    let unreliableTableCount = 0;
    let tableIndex = 0;
    let scannedPages = 0;
    let imageOnlyPages = 0;

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      if (Date.now() - started > PDF_LIMITS.parseTimeoutMs) {
        return { success: false, error: "PDF parsing exceeded the safety timeout." };
      }
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const textContent = await page.getTextContent();
      const operatorList = await page.getOperatorList();
      const hasImages = operatorList.fnArray.some((fn: number) =>
        fn === pdfjs.OPS.paintImageXObject
        || fn === pdfjs.OPS.paintInlineImageXObject
        || fn === pdfjs.OPS.paintImageMaskXObject
      );

      const items: TextItem[] = [];
      for (const raw of textContent.items) {
        if (!("str" in raw) || typeof raw.str !== "string" || !raw.str.trim()) continue;
        const transform = raw.transform;
        items.push({
          str: raw.str,
          x: transform[4],
          y: transform[5],
          width: raw.width ?? Math.abs(transform[0]) * raw.str.length,
          height: (raw.height ?? Math.abs(transform[3])) || 10
        });
        if (items.length > PDF_LIMITS.maxTextItemsPerPage) {
          return { success: false, error: `Page ${pageNumber} exceeds the text-item safety limit.` };
        }
      }

      const charCount = items.reduce((sum, item) => sum + item.str.replace(/\s+/g, "").length, 0);
      const quality = pageQuality(charCount, items.length, hasImages);
      pages.push({
        pageNumber,
        width: viewport.width,
        height: viewport.height,
        textItemCount: items.length,
        charCount,
        quality,
        hasImages
      });

      if (quality === "likely_scanned" || quality === "empty") {
        scannedPages += 1;
        if (hasImages) imageOnlyPages += 1;
        warnings.push(
          `Page ${pageNumber}: ${quality === "likely_scanned" ? "likely scanned / image-only" : "empty"} — OCR is not run in this version; no requirements were invented from this page.`
        );
        continue;
      }

      const lines = clusterY(items).map((lineItems) => {
        const joined = joinLine(lineItems);
        return { ...joined, items: lineItems };
      }).filter((line) => line.text.length > 0);

      const { tables, rejected } = detectReliableTables(lines);
      unreliableTableCount += rejected;
      const tableLineKeys = new Set<string>();
      for (const table of tables) {
        for (const [rowIndex, row] of table.entries()) {
          for (const [cellIndex, cell] of row.entries()) {
            if (!cell.text.trim()) continue;
            tableLineKeys.add(`${cell.bbox.y.toFixed(1)}:${cell.text}`);
            const languageHints = matchesMandatory(cell.text);
            const anchor: PdfSourceAnchor = {
              kind: "pdf_table_cell",
              pageIndex: pageNumber - 1,
              pageNumber,
              tableIndex,
              rowIndex,
              cellIndex,
              bbox: cell.bbox,
              startOffset: 0,
              endOffset: cell.text.length
            };
            if (fragments.length >= PDF_LIMITS.maxFragments) {
              return { success: false, error: `PDF produced more than ${PDF_LIMITS.maxFragments} fragments.` };
            }
            fragments.push({
              fragmentId: buildPdfFragmentId(contentHash, anchor, cell.text),
              kind: languageHints.length > 0 ? "mandatory_candidate" : "table_cell",
              exactText: cell.text,
              headingPath: [`Page ${pageNumber}`],
              tableRef: { tableIndex, rowIndex, cellIndex },
              sourceAnchor: anchor,
              extractionQuality: "table_heuristic",
              ...(languageHints.length > 0 ? { languageHints } : {})
            });
            allTexts.push(cell.text);
          }
        }
        tableIndex += 1;
      }
      if (rejected > 0) {
        warnings.push(
          `Page ${pageNumber}: ${rejected} multi-column line(s) were not converted into tables because column alignment was unreliable.`
        );
      }

      for (const line of lines) {
        if (tableLineKeys.has(`${line.bbox.y.toFixed(1)}:${line.text}`)) continue;
        // Skip lines that are fully consumed as table cells (approximate by text membership).
        const inTable = tables.some((table) =>
          table.some((row) => row.some((cell) => cell.text === line.text && Math.abs(cell.bbox.y - line.bbox.y) < 2))
        );
        if (inTable) continue;

        const kind = classifyLine(line.text);
        const languageHints = matchesMandatory(line.text);
        const extractionQuality: FragmentExtractionQuality =
          quality === "sparse_text" ? "sparse_text" : "digital_text";
        const anchor: PdfSourceAnchor = {
          kind: "pdf_text_block",
          pageIndex: pageNumber - 1,
          pageNumber,
          bbox: line.bbox,
          startOffset: 0,
          endOffset: line.text.length
        };
        if (fragments.length >= PDF_LIMITS.maxFragments) {
          return { success: false, error: `PDF produced more than ${PDF_LIMITS.maxFragments} fragments.` };
        }
        fragments.push({
          fragmentId: buildPdfFragmentId(contentHash, anchor, line.text),
          kind: languageHints.length > 0 && kind === "paragraph" ? "mandatory_candidate" : kind,
          exactText: line.text,
          headingPath: [`Page ${pageNumber}`],
          sourceAnchor: anchor,
          extractionQuality,
          ...(languageHints.length > 0 ? { languageHints } : {}),
          ...(kind === "numbered_clause"
            ? { numberingLabel: line.text.match(/^(\d+(?:\.\d+)*)/)?.[1] }
            : {})
        });
        allTexts.push(line.text);
      }
    }

    if (scannedPages > 0) {
      unsupported.push({
        kind: "likely_scanned_page",
        count: scannedPages,
        message: "Scanned or empty pages were detected. OCR is deferred to a later version and was not applied."
      });
    }
    if (imageOnlyPages > 0) {
      unsupported.push({
        kind: "image_page",
        count: imageOnlyPages,
        message: "Image-heavy pages without enough extractable text were skipped."
      });
    }
    if (unreliableTableCount > 0) {
      unsupported.push({
        kind: "unreliable_table",
        count: unreliableTableCount,
        message: "Some multi-column layouts were not promoted to tables because alignment was not reliable."
      });
    }

    warnings.unshift(
      "PDF import extracts candidate requirements from digital text only. Verify every source page before saving — this is not a fully automatic import."
    );

    return {
      success: true,
      data: {
        safeFileName: envelope.safeFileName,
        contentHash,
        parserVersion: PDF_PARSER_VERSION,
        language: detectLanguage(allTexts, options?.language),
        metadata,
        pageCount: pdf.numPages,
        pages,
        fragments,
        unsupportedContent: unsupported,
        unreliableTableCount,
        warnings,
        extractionMode: "digital_text_only"
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "PDF extraction failed."
    };
  }
}

/** Render a single PDF page to a PNG data URL for wizard preview (browser / canvas environments). */
export async function renderPdfPagePreview(
  buffer: ArrayBuffer,
  pageNumber: number,
  scale = 1.25
): Promise<{ success: true; dataUrl: string; width: number; height: number } | { success: false; error: string }> {
  try {
    const pdfjs = await loadPdfjs();
    const pdf = await pdfjs.getDocument({
      data: new Uint8Array(buffer.slice(0)),
      disableWorker: true,
      isEvalSupported: false
    } as Parameters<typeof pdfjs.getDocument>[0]).promise;
    if (pageNumber < 1 || pageNumber > pdf.numPages) {
      return { success: false, error: `Page ${pageNumber} is out of range.` };
    }
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    if (typeof document === "undefined") {
      return { success: false, error: "Page preview requires a browser canvas environment." };
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) return { success: false, error: "Could not create canvas context for PDF preview." };
    await page.render({ canvasContext: context, viewport, canvas }).promise;
    return { success: true, dataUrl: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "PDF page preview failed." };
  }
}
