import { PersistenceError } from "@/persistence/supabaseRest";

const JSON_HEADERS = { "Content-Type": "application/json" };

function serverConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey) throw new PersistenceError("Persistence is not configured.", 503);
  return { url, anonKey, serviceRoleKey };
}

async function request<T>(key: string, path: string, init: RequestInit = {}): Promise<T> {
  const { url } = serverConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      ...JSON_HEADERS,
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...(init.headers ?? {})
    },
    cache: "no-store"
  });
  if (!response.ok) {
    throw new PersistenceError(
      response.status === 409
        ? "An idempotency key or immutable resource identity is already in use."
        : response.status === 403
          ? "The machine API is not authorized for this resource."
          : "The machine API persistence request failed.",
      response.status
    );
  }
  return response.status === 204 ? undefined as T : await response.json() as T;
}

export function serviceSupabaseRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { serviceRoleKey } = serverConfig();
  if (!serviceRoleKey) throw new PersistenceError("Machine API persistence is not configured.", 503);
  return request<T>(serviceRoleKey, path, init);
}

export function anonSupabaseRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  return request<T>(serverConfig().anonKey, path, init);
}
