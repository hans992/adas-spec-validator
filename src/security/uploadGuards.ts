/**
 * Server-side upload validation shared by all file-accepting routes.
 *
 * Every uploaded file must pass, in order: filename sanitization, extension +
 * MIME allowlist, per-kind size cap, and magic-byte verification so a renamed
 * payload cannot reach a parser built for a different format. Container-level
 * ZIP bomb limits for DOCX/XLSX live in the format parsers themselves
 * (specificationDocx/specificationXlsx inspectZip); this module rejects
 * mismatched containers before those parsers ever run.
 */

export type UploadKind = "ifc" | "model_json" | "xlsx" | "docx" | "pdf" | "csv";

interface UploadPolicy {
  maxBytes: number;
  extensions: string[];
  /** Empty MIME (some browsers/CLIs) is accepted; a declared MIME must match. */
  mimes: string[];
}

export const UPLOAD_POLICIES: Record<UploadKind, UploadPolicy> = {
  ifc: {
    maxBytes: 20 * 1024 * 1024,
    extensions: [".ifc"],
    mimes: ["application/x-step", "application/step", "model/ifc", "text/plain", "application/octet-stream"]
  },
  model_json: {
    maxBytes: 5 * 1024 * 1024,
    extensions: [".json"],
    mimes: ["application/json", "text/json", "application/octet-stream"]
  },
  xlsx: {
    maxBytes: 10 * 1024 * 1024,
    extensions: [".xlsx"],
    mimes: [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/octet-stream"
    ]
  },
  docx: {
    maxBytes: 15 * 1024 * 1024,
    extensions: [".docx"],
    mimes: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/octet-stream"
    ]
  },
  pdf: {
    maxBytes: 20 * 1024 * 1024,
    extensions: [".pdf"],
    mimes: ["application/pdf", "application/octet-stream"]
  },
  csv: {
    maxBytes: 10 * 1024 * 1024,
    extensions: [".csv"],
    mimes: ["text/csv", "application/csv", "text/plain", "application/octet-stream"]
  }
};

/**
 * Strips directory components, control characters, and shell-hostile characters.
 * The result is safe to store, echo in headers, and embed in ZIP entries.
 */
export function sanitizeFileName(rawName: string): string {
  const baseName = rawName.split(/[\\/]/).pop() ?? "";
  const cleaned = baseName
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>:"|?*]/g, "_")
    .replace(/^\.+/, "")
    .trim();
  if (!cleaned) return "upload.bin";
  if (cleaned.length <= 160) return cleaned;
  const dot = cleaned.lastIndexOf(".");
  const extension = dot > 0 ? cleaned.slice(dot).slice(0, 16) : "";
  return `${cleaned.slice(0, 160 - extension.length)}${extension}`;
}

export type DetectedContainer = "zip" | "pdf" | "step" | "json" | "text" | "empty" | "unknown";

/** Identifies the actual container format from leading bytes, ignoring the name. */
export function detectContainer(bytes: Uint8Array): DetectedContainer {
  if (bytes.byteLength === 0) return "empty";
  if (bytes.byteLength >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07)) {
    return "zip";
  }
  const head = new TextDecoder().decode(bytes.slice(0, Math.min(bytes.byteLength, 4096)));
  if (head.startsWith("%PDF-")) return "pdf";
  if (head.toUpperCase().includes("ISO-10303-21")) return "step";
  const firstVisible = head.trimStart()[0];
  if (firstVisible === "{" || firstVisible === "[") return "json";
  // Reject binary masquerading as text: NUL bytes never appear in CSV/JSON/IFC.
  if (bytes.slice(0, Math.min(bytes.byteLength, 4096)).includes(0)) return "unknown";
  return "text";
}

const EXPECTED_CONTAINER: Record<UploadKind, DetectedContainer[]> = {
  ifc: ["step"],
  model_json: ["json"],
  xlsx: ["zip"],
  docx: ["zip"],
  pdf: ["pdf"],
  csv: ["text", "json"]
};

export interface UploadRejection {
  ok: false;
  error: string;
  status: number;
}

export interface UploadAcceptance {
  ok: true;
  safeFileName: string;
}

/**
 * Full upload gate. Callers should check size (`file.size`) before buffering
 * when possible and then pass the buffered bytes here for content verification.
 */
export function assertUploadedFile(input: {
  kind: UploadKind;
  fileName: string;
  mimeType?: string | null;
  bytes: Uint8Array;
}): UploadAcceptance | UploadRejection {
  const policy = UPLOAD_POLICIES[input.kind];
  const safeFileName = sanitizeFileName(input.fileName);
  const lowerName = safeFileName.toLowerCase();

  if (!policy.extensions.some((extension) => lowerName.endsWith(extension))) {
    return { ok: false, status: 415, error: `Only ${policy.extensions.join(", ")} files are accepted.` };
  }
  const mime = (input.mimeType ?? "").split(";")[0].trim().toLowerCase();
  if (mime && !policy.mimes.includes(mime)) {
    return { ok: false, status: 415, error: "The declared content type is not allowed for this upload." };
  }
  if (input.bytes.byteLength === 0) {
    return { ok: false, status: 400, error: "The uploaded file is empty." };
  }
  if (input.bytes.byteLength > policy.maxBytes) {
    return {
      ok: false,
      status: 413,
      error: `The file exceeds the ${Math.floor(policy.maxBytes / (1024 * 1024))} MB limit.`
    };
  }
  const container = detectContainer(input.bytes);
  if (!EXPECTED_CONTAINER[input.kind].includes(container)) {
    return { ok: false, status: 415, error: "File content does not match its declared format." };
  }
  return { ok: true, safeFileName };
}

/**
 * Hard wall-clock limit around a parser invocation. Parsers for untrusted
 * documents must never run unbounded; a timeout converts a pathological input
 * into a clean 422 instead of a wedged serverless function.
 */
export async function withParserTimeout<T>(run: () => Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      run(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} exceeded the ${Math.round(timeoutMs / 1000)}s parser time limit.`)), timeoutMs);
      })
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
