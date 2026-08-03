export type BrowserSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  email: string;
};

const SESSION_KEY = "adas.supabase.session";

function authConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Project persistence is not configured.");
  return { url, anonKey };
}

export function readBrowserSession(): BrowserSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as BrowserSession;
    return session.accessToken && session.expiresAt > Date.now() ? session : null;
  } catch {
    return null;
  }
}

export function clearBrowserSession() {
  window.localStorage.removeItem(SESSION_KEY);
}

export async function signInWithPassword(email: string, password: string) {
  const { url, anonKey } = authConfig();
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  if (!response.ok) throw new Error("Email or password is incorrect.");
  const payload = await response.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    user?: { email?: string };
  };
  const session: BrowserSession = {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: Date.now() + payload.expires_in * 1000,
    email: payload.user?.email ?? email
  };
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}
