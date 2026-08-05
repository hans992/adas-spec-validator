import { createHash } from "node:crypto";

import { findingEvidenceSchema } from "@/persistence/schemas";
import { authenticatedUserId, bearerToken, persistenceResponse, supabaseRequest } from "@/persistence/supabaseRest";

export const runtime = "nodejs";

type Context = { params: Promise<{ projectId: string; validationId: string }> };

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export async function GET(request: Request, context: Context) {
  try {
    const token = bearerToken(request);
    await authenticatedUserId(token);
    const { projectId, validationId } = await context.params;
    const includeContent = new URL(request.url).searchParams.get("content") === "1";
    const select = includeContent
      ? "id,requirement_id,rule_id,finding_key,kind,title,comment,link_url,technical_note,model_element_id,model_element_type,file_name,file_mime,file_size_bytes,file_content_hash,file_content_base64,created_by,created_at"
      : "id,requirement_id,rule_id,finding_key,kind,title,comment,link_url,technical_note,model_element_id,model_element_type,file_name,file_mime,file_size_bytes,file_content_hash,created_by,created_at";
    const evidence = await supabaseRequest<unknown[]>(token,
      `finding_evidence?project_id=eq.${encodeURIComponent(projectId)}&validation_run_id=eq.${encodeURIComponent(validationId)}&select=${select}&order=created_at.desc`
    );
    return Response.json({ evidence });
  } catch (error) {
    return persistenceResponse(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const token = bearerToken(request);
    const actorId = await authenticatedUserId(token);
    const { projectId, validationId } = await context.params;
    const input = findingEvidenceSchema.parse(await request.json());
    const runs = await supabaseRequest<Array<{
      owner_id: string;
      requirements?: Array<{ id?: string }>;
      results?: Array<{ requirementId?: string; ruleId?: string }>;
    }>>(token,
      `validation_runs?id=eq.${encodeURIComponent(validationId)}&project_id=eq.${encodeURIComponent(projectId)}&select=owner_id,requirements,results&limit=1`
    );
    if (!runs[0]) return Response.json({ error: "Validation not found." }, { status: 404 });
    if (!runs[0].requirements?.some((requirement) => requirement.id === input.requirementId)) {
      return Response.json({ error: "Requirement not found in this validation." }, { status: 400 });
    }
    if (input.ruleId && !runs[0].results?.some((result) =>
      result.requirementId === input.requirementId && result.ruleId === input.ruleId
    )) {
      return Response.json({ error: "Rule finding not found in this validation." }, { status: 400 });
    }

    let fileMeta: Record<string, unknown> = {};
    if (input.fileContentBase64 && input.fileName) {
      const bytes = Buffer.from(input.fileContentBase64, "base64");
      if (bytes.byteLength === 0 || bytes.byteLength > MAX_ATTACHMENT_BYTES) {
        return Response.json({ error: "Attachment must be between 1 byte and 5 MB." }, { status: 413 });
      }
      fileMeta = {
        file_name: input.fileName,
        file_mime: input.fileMime ?? "application/octet-stream",
        file_size_bytes: bytes.byteLength,
        file_content_hash: createHash("sha256").update(bytes).digest("hex"),
        file_content_base64: input.fileContentBase64
      };
    }

    const rows = await supabaseRequest<unknown[]>(token, "finding_evidence", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        validation_run_id: validationId,
        project_id: projectId,
        owner_id: runs[0].owner_id,
        created_by: actorId,
        requirement_id: input.requirementId,
        rule_id: input.ruleId ?? null,
        finding_key: input.findingKey,
        kind: input.kind,
        title: input.title,
        comment: input.comment,
        link_url: input.linkUrl ?? null,
        technical_note: input.technicalNote ?? null,
        model_element_id: input.modelElementId ?? null,
        model_element_type: input.modelElementType ?? null,
        ...fileMeta
      })
    });
    return Response.json({ evidence: rows[0] }, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError || (typeof error === "object" && error !== null && "issues" in error)) {
      return Response.json({ error: "Invalid evidence payload." }, { status: 400 });
    }
    return persistenceResponse(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const token = bearerToken(request);
    await authenticatedUserId(token);
    const { projectId, validationId } = await context.params;
    const evidenceId = new URL(request.url).searchParams.get("evidenceId");
    if (!evidenceId || !/^[0-9a-f-]{36}$/i.test(evidenceId)) {
      return Response.json({ error: "A valid evidenceId is required." }, { status: 400 });
    }
    await supabaseRequest(token,
      `finding_evidence?id=eq.${encodeURIComponent(evidenceId)}&project_id=eq.${encodeURIComponent(projectId)}&validation_run_id=eq.${encodeURIComponent(validationId)}`,
      { method: "DELETE" }
    );
    return new Response(null, { status: 204 });
  } catch (error) {
    return persistenceResponse(error);
  }
}
