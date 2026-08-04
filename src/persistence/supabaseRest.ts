const JSON_HEADERS = { "Content-Type": "application/json" };

export class PersistenceError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new PersistenceError("Persistence is not configured.", 503);
  return { url, anonKey };
}

export function bearerToken(request: Request) {
  const value = request.headers.get("authorization");
  if (!value?.startsWith("Bearer ") || value.length <= 7) {
    throw new PersistenceError("Authentication is required.", 401);
  }
  return value.slice(7);
}

export async function authenticatedUserId(token: string) {
  const { url, anonKey } = config();
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    cache: "no-store"
  });
  if (!response.ok) throw new PersistenceError("The session is invalid or expired.", 401);
  const user = await response.json() as { id?: string };
  if (!user.id) throw new PersistenceError("The session is invalid or expired.", 401);
  return user.id;
}

export async function supabaseRequest<T>(token: string, path: string, init: RequestInit = {}) {
  const { url, anonKey } = config();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      ...JSON_HEADERS,
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {})
    },
    cache: "no-store"
  });
  if (!response.ok) {
    throw new PersistenceError(
      response.status === 403
        ? "You do not have access to this resource."
        : response.status === 409
          ? "A record with this identity already exists. Use a new revision."
          : "The persistence request failed.",
      response.status
    );
  }
  return response.status === 204 ? undefined as T : await response.json() as T;
}

export function persistenceResponse(error: unknown) {
  const status = error instanceof PersistenceError ? error.status : 500;
  const message = error instanceof PersistenceError ? error.message : "Persistence failed.";
  return Response.json({ error: message }, { status });
}
