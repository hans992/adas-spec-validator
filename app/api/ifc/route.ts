import { NextResponse } from "next/server";

import { parseIfcBytes } from "@/domain/ifcParser";
import { createRequestLog, metricEvent } from "@/observability/logger";
import { clientIpKey, consumeRateLimit, rateLimitedResponse } from "@/security/rateLimit";
import { assertUploadedFile, UPLOAD_POLICIES, withParserTimeout } from "@/security/uploadGuards";

export const runtime = "nodejs";

const IFC_PARSE_TIMEOUT_MS = 30_000;

export async function POST(request: Request) {
  const log = createRequestLog("/api/ifc");
  try {
    const rateLimit = await consumeRateLimit("upload", clientIpKey(request));
    if (!rateLimit.allowed) {
      return rateLimitedResponse(rateLimit, "Too many uploads. Please try again shortly.");
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "An IFC file is required." }, { status: 400 });
    }
    if (file.size === 0 || file.size > UPLOAD_POLICIES.ifc.maxBytes) {
      return NextResponse.json({ error: "IFC file must be non-empty and no larger than 20 MB." }, { status: 413 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const guard = assertUploadedFile({ kind: "ifc", fileName: file.name, mimeType: file.type, bytes });
    if (!guard.ok) {
      metricEvent("upload_rejected", { requestId: log.requestId, kind: "ifc", status: guard.status });
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const result = await withParserTimeout(() => parseIfcBytes(bytes), IFC_PARSE_TIMEOUT_MS, "IFC parse");
    metricEvent("ifc_import_duration_ms", {
      requestId: log.requestId,
      value: Date.now() - log.startedAt,
      sizeBytes: bytes.byteLength
    });
    log.finish({ status: 200 });
    return NextResponse.json(result, { headers: { "X-Request-Id": log.requestId } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "IFC parsing failed.";
    metricEvent("parser_failure", { requestId: log.requestId, kind: "ifc" });
    log.fail(error, { status: 422 });
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
