import { createHash, randomBytes } from "node:crypto";

import { PersistenceError } from "@/persistence/supabaseRest";
import { anonSupabaseRequest } from "@/persistence/serviceSupabase";

export const PROJECT_API_SCOPES = [
  "models:read",
  "models:write",
  "specifications:read",
  "specifications:write",
  "runs:read",
  "runs:write",
  "regressions:read"
] as const;

export type ProjectApiScope = typeof PROJECT_API_SCOPES[number];

export interface ProjectApiIdentity {
  tokenId: string;
  projectId: string;
  ownerId: string;
  actorId: string;
  scopes: ProjectApiScope[];
}

type TokenLookupRow = {
  token_id: string;
  project_id: string;
  owner_id: string;
  created_by: string;
  scopes: string[];
};

export function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function createProjectApiToken(): { token: string; hash: string; prefix: string } {
  const token = `aec_${randomBytes(32).toString("base64url")}`;
  return { token, hash: sha256Hex(token), prefix: token.slice(0, 12) };
}

export function readIdempotencyKey(request: Request): string {
  const key = request.headers.get("idempotency-key")?.trim();
  if (!key || key.length > 200 || !/^[A-Za-z0-9._:/-]+$/.test(key)) {
    throw new PersistenceError(
      "A valid Idempotency-Key header (1-200 URL-safe characters) is required.",
      400
    );
  }
  return key;
}

export async function requireProjectApiScope(
  request: Request,
  expectedProjectId: string,
  requiredScope: ProjectApiScope
): Promise<ProjectApiIdentity> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer aec_")) {
    throw new PersistenceError("A project API token is required.", 401);
  }
  const token = authorization.slice(7);
  const rows = await anonSupabaseRequest<TokenLookupRow[]>("rpc/authenticate_project_api_token", {
    method: "POST",
    body: JSON.stringify({ input_hash: sha256Hex(token) })
  });
  const row = rows[0];
  if (!row) throw new PersistenceError("The project API token is invalid, expired, or revoked.", 401);
  if (row.project_id !== expectedProjectId) {
    throw new PersistenceError("The project API token cannot access this project.", 403);
  }
  if (!row.scopes.includes(requiredScope)) {
    throw new PersistenceError(`The project API token lacks scope '${requiredScope}'.`, 403);
  }
  return {
    tokenId: row.token_id,
    projectId: row.project_id,
    ownerId: row.owner_id,
    actorId: row.created_by,
    scopes: row.scopes.filter(
      (scope): scope is ProjectApiScope => PROJECT_API_SCOPES.includes(scope as ProjectApiScope)
    )
  };
}

export function apiErrorResponse(error: unknown, requestId = crypto.randomUUID()): Response {
  const status = error instanceof PersistenceError ? error.status : 500;
  const message = error instanceof PersistenceError ? error.message : "The pipeline request failed.";
  return Response.json(
    { error: { code: status === 500 ? "internal_error" : "request_failed", message }, requestId },
    { status, headers: { "X-Request-Id": requestId } }
  );
}

export function apiResponse(
  data: unknown,
  options: { status?: number; requestId?: string } = {}
): Response {
  const requestId = options.requestId ?? crypto.randomUUID();
  return Response.json(
    { data, requestId },
    { status: options.status ?? 200, headers: { "X-Request-Id": requestId } }
  );
}
