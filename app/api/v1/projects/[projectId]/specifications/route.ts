import { inputFingerprint } from "@/domain/pipelineArtifacts";
import { parsePipelineSpecification } from "@/domain/pipelineSpecification";
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
    await requireProjectApiScope(request, projectId, "specifications:read");
    const rows = await serviceSupabaseRequest<unknown[]>(
      `specification_packages?project_id=eq.${encodeURIComponent(projectId)}&select=id,name,revision,source_file_name,source_content_hash,created_at&order=created_at.desc&limit=100`
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
    const identity = await requireProjectApiScope(request, projectId, "specifications:write");
    const idempotencyKey = readIdempotencyKey(request);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new PersistenceError("A specification file is required.", 400);
    if (file.size === 0 || file.size > 10 * 1024 * 1024) {
      throw new PersistenceError("Specification must be non-empty and no larger than 10 MB.", 413);
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
      name: string;
      revision: string;
      source_file_name: string;
      source_content_hash: string;
      created_at: string;
    }>>(
      `specification_packages?project_id=eq.${encodeURIComponent(projectId)}&idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&select=id,input_fingerprint,name,revision,source_file_name,source_content_hash,created_at&limit=1`
    );
    if (existing[0]) {
      if (existing[0].input_fingerprint !== fingerprint) {
        throw new PersistenceError("Idempotency-Key was already used with different specification input.", 409);
      }
      return apiResponse({ specification: existing[0], replayed: true }, { requestId });
    }

    let specification;
    try {
      specification = await parsePipelineSpecification(file);
    } catch (error) {
      throw new PersistenceError(
        error instanceof Error ? error.message : "Specification parsing failed.",
        422
      );
    }
    const { documentSource, ...fields } = specification;
    const rows = await serviceSupabaseRequest<unknown[]>("specification_packages", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        project_id: projectId,
        owner_id: identity.ownerId,
        created_by: identity.actorId,
        ...fields,
        ...(documentSource ? { document_source: documentSource } : {}),
        source_file_name: file.name.slice(0, 255),
        source_content_hash: contentHash,
        input_fingerprint: fingerprint,
        idempotency_key: idempotencyKey
      })
    });
    return apiResponse({ specification: rows[0], replayed: false }, { status: 201, requestId });
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}
