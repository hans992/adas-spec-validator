import { inputFingerprint } from "@/domain/pipelineArtifacts";
import { parseIfcBytes } from "@/domain/ifcParser";
import { validateUploadedModel } from "@/domain/uploadHelpers";
import {
  apiErrorResponse,
  apiResponse,
  readIdempotencyKey,
  requireProjectApiScope,
  sha256Hex
} from "@/persistence/projectApiAuth";
import { PersistenceError } from "@/persistence/supabaseRest";
import { serviceSupabaseRequest } from "@/persistence/serviceSupabase";

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
    const idempotencyKey = readIdempotencyKey(request);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new PersistenceError("A model file is required.", 400);
    if (file.size === 0 || file.size > 20 * 1024 * 1024) {
      throw new PersistenceError("Model must be non-empty and no larger than 20 MB.", 413);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const contentHash = sha256Hex(bytes);
    const fingerprint = inputFingerprint({
      fileName: file.name,
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

    let model;
    let diagnostics: unknown = null;
    if (file.name.toLowerCase().endsWith(".ifc")) {
      const parsed = await parseIfcBytes(bytes);
      model = parsed.model;
      diagnostics = parsed.diagnostics;
    } else if (file.name.toLowerCase().endsWith(".json")) {
      let raw: unknown;
      try {
        raw = JSON.parse(new TextDecoder().decode(bytes));
      } catch {
        throw new PersistenceError("Model JSON is invalid.", 422);
      }
      const parsed = validateUploadedModel(raw);
      if (!parsed.success) throw new PersistenceError(parsed.error, 422);
      model = parsed.data;
    } else {
      throw new PersistenceError("Only .ifc and normalized-model .json files are accepted.", 415);
    }

    const rows = await serviceSupabaseRequest<unknown[]>("project_model_assets", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        project_id: projectId,
        owner_id: identity.ownerId,
        created_by: identity.actorId,
        source_file_name: file.name.slice(0, 255),
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
