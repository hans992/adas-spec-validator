import { describe, expect, it } from "vitest";

import {
  assertUploadedFile,
  detectContainer,
  sanitizeFileName,
  withParserTimeout
} from "@/security/uploadGuards";

const encode = (text: string) => new TextEncoder().encode(text);
const IFC_HEAD = "ISO-10303-21;\nHEADER;\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;";

describe("filename sanitization", () => {
  it("strips path traversal and control characters", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("..\\..\\windows\\system32\\model.ifc")).toBe("model.ifc");
    expect(sanitizeFileName("plan\u0000<script>.ifc")).toBe("plan_script_.ifc");
    expect(sanitizeFileName(".hidden.ifc")).toBe("hidden.ifc");
    expect(sanitizeFileName("   ")).toBe("upload.bin");
  });

  it("caps length while keeping the extension", () => {
    const long = `${"a".repeat(400)}.xlsx`;
    const safe = sanitizeFileName(long);
    expect(safe.length).toBeLessThanOrEqual(160);
    expect(safe.endsWith(".xlsx")).toBe(true);
  });
});

describe("magic byte detection", () => {
  it("recognizes real container formats", () => {
    expect(detectContainer(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0]))).toBe("zip");
    expect(detectContainer(encode("%PDF-1.7 rest"))).toBe("pdf");
    expect(detectContainer(encode(IFC_HEAD))).toBe("step");
    expect(detectContainer(encode('{"levels":[]}'))).toBe("json");
    expect(detectContainer(encode("id,name\n1,Room"))).toBe("text");
    expect(detectContainer(new Uint8Array(0))).toBe("empty");
    expect(detectContainer(new Uint8Array([0x4d, 0x5a, 0x00, 0x01]))).toBe("unknown");
  });
});

describe("upload gate attacks", () => {
  it("rejects an executable renamed to .ifc", () => {
    const result = assertUploadedFile({
      kind: "ifc",
      fileName: "model.ifc",
      mimeType: "application/octet-stream",
      bytes: new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03])
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(415);
  });

  it("rejects a ZIP (potential bomb container) renamed to .ifc", () => {
    const result = assertUploadedFile({
      kind: "ifc",
      fileName: "bomb.ifc",
      mimeType: "",
      bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00])
    });
    expect(result.ok).toBe(false);
  });

  it("rejects disallowed MIME types even with a valid body", () => {
    const result = assertUploadedFile({
      kind: "xlsx",
      fileName: "spec.xlsx",
      mimeType: "text/html",
      bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04])
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(415);
  });

  it("rejects oversized and empty files", () => {
    const oversized = assertUploadedFile({
      kind: "model_json",
      fileName: "model.json",
      mimeType: "application/json",
      bytes: new Uint8Array(5 * 1024 * 1024 + 1)
    });
    expect(oversized.ok).toBe(false);
    if (!oversized.ok) expect(oversized.status).toBe(413);
    const empty = assertUploadedFile({
      kind: "ifc",
      fileName: "model.ifc",
      mimeType: "",
      bytes: new Uint8Array(0)
    });
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.status).toBe(400);
  });

  it("rejects a PDF renamed to .docx", () => {
    const result = assertUploadedFile({
      kind: "docx",
      fileName: "spec.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      bytes: encode("%PDF-1.4 something")
    });
    expect(result.ok).toBe(false);
  });

  it("accepts legitimate uploads and returns the sanitized name", () => {
    const result = assertUploadedFile({
      kind: "ifc",
      fileName: "../uploads/Office Tower.ifc",
      mimeType: "application/octet-stream",
      bytes: encode(IFC_HEAD)
    });
    expect(result).toEqual({ ok: true, safeFileName: "Office Tower.ifc" });
  });
});

describe("parser timeout", () => {
  it("returns the parser result inside the limit", async () => {
    await expect(withParserTimeout(async () => "done", 1_000, "Test parse")).resolves.toBe("done");
  });

  it("rejects a parser that exceeds its wall clock budget", async () => {
    await expect(
      withParserTimeout(() => new Promise((resolve) => setTimeout(resolve, 500)), 20, "IFC parse")
    ).rejects.toThrow(/parser time limit/);
  });
});
