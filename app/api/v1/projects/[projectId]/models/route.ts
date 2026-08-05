import { inputFingerprint } from "@/domain/pipelineArtifacts";
import { parseIfcBytes } from "@/domain/ifcParser";
import { validateUploadedModel } from "@/domain/uploadHelpers";
import { metricEvent } from "@/observability/logger";
import {
  apiErrorResponse,
  apiResponse,
  readIdempotencyKey,
  requireProjectApiScope,
  sha256Hex
} from "@/persistence/projectApiAuth";
import { PersistenceError } from "@/persistence/supabaseRest";
import { serviceSupabaseRequest } from "@/persistence/serviceSupabase";
import { consumeRateLimit, rateLimitedResponse } from "@/security/rateLimit";
import { assertUploadedFile, withParserTimeout } from "@/security/uploadGuards";

export const runtime = "nodejs";
type Context = { params: Promise<{ projectId: string }> };

export async function GET(request: Request, context: Context) {
  const requestId = crypto.randomUUID();
  try {
    const { projectId } = await context.params;
    await requireProjectApiScope(request, projectId, "models:read");
    const rows = await serviceSupabaseRequest<unknown[]>(
      `project_model_assets?project_id=eq.${encodeURIComponent(projectId)}&select=id,source_file_name,source_content_hash,diagnostics,created_at&order=created_at.desc&limit=100`
    );
    return apiResponse({ items: rows, nextCursor: null }, { requestId });
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

export async function POST(request: Request, context: Context) {
  const requestId = crypto.randomUUID();
  try {
    const { projectId } = await context.params;
    const identity = await requireProjectApiScope(request, projectId, "models:write");
    const rateLimit = await consumeRateLimit("upload", `project:${projectId}`);
    if (!rateLimit.allowed) {
      return rateLimitedResponse(rateLimit, "Too many model uploads for this project. Please retry later.");
    }
    const idempotencyKey = readIdempotencyKey(request);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new PersistenceError("A model file is required.", 400);
    if (file.size === 0 || file.size > 20 * 1024 * 1024) {
      throw new PersistenceError("Model must be non-empty and no larger than 20 MB.", 413);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const uploadKind = file.name.toLowerCase().endsWith(".json") ? "model_json" as const : "ifc" as const;
    const guard = assertUploadedFile({ kind: uploadKind, fileName: file.name, mimeType: file.type, bytes });
    if (!guard.ok) {
      metricEvent("upload_rejected", { requestId, kind: uploadKind, status: guard.status });
      throw new PersistenceError(guard.error, guard.status);
    }
    const contentHash = sha256Hex(bytes);
    const fingerprint = inputFingerprint({
      fileName: guard.safeFileName,
      contentHash,
      contentType: file.type || "application/octet-stream"
    });

    const existing = await serviceSupabaseRequest<Array<{
      id: string;
      input_fingerprint: string;
      source_file_name: string;
      source_content_hash: string;
      diagnostics: unknown;
      created_at: string;
    }>>(
      `project_model_assets?project_id=eq.${encodeURIComponent(projectId)}&idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&select=id,input_fingerprint,source_file_name,source_content_hash,diagnostics,created_at&limit=1`
    );
    if (existing[0]) {
      if (existing[0].input_fingerprint !== fingerprint) {
        throw new PersistenceError("Idempotency-Key was already used with different model input.", 409);
      }
      return apiResponse({ model: existing[0], replayed: true }, { requestId });
    }

    const parseStartedAt = Date.now();
    let model;
    let diagnostics: unknown = null;
    if (uploadKind === "ifc") {
      try {
        const parsed = await withParserTimeout(() => parseIfcBytes(bytes), 30_000, "IFC parse");
        model = parsed.model;
        diagnostics = parsed.diagnostics;
      } catch (error) {
        metricEvent("parser_failure", { requestId, kind: "ifc" });
        throw new PersistenceError(error instanceof Error ? error.message : "IFC parsing failed.", 422);
      }
    } else {
      let raw: unknown;
      try {
        raw = JSON.parse(new TextDecoder().decode(bytes));
      } catch {
        throw new PersistenceError("Model JSON is invalid.", 422);
      }
      const parsed = validateUploadedModel(raw);
      if (!parsed.success) throw new PersistenceError(parsed.error, 422);
      model = parsed.data;
    }
    metricEvent("model_import_duration_ms", { requestId, value: Date.now() - parseStartedAt, kind: uploadKind });

    const rows = await serviceSupabaseRequest<unknown[]>("project_model_assets", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        project_id: projectId,
        owner_id: identity.ownerId,
        created_by: identity.actorId,
        source_file_name: guard.safeFileName.slice(0, 255),
        source_content_hash: contentHash,
        input_fingerprint: fingerprint,
        idempotency_key: idempotencyKey,
        normalized_model: model,
        diagnostics
      })
    });
    return apiResponse({ model: rows[0], replayed: false }, { status: 201, requestId });
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}
