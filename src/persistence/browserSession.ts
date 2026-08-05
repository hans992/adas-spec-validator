export type BrowserSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  email: string;
};

type AuthPayload = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user?: { email?: string };
};

const SESSION_KEY = "aec.supabase.session";
const REFRESH_MARGIN_MS = 60_000;

function authConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Project persistence is not configured.");
  return { url, anonKey };
}

function saveSession(payload: AuthPayload, fallbackEmail = "") {
  const session: BrowserSession = {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: Date.now() + payload.expires_in * 1000,
    email: payload.user?.email ?? fallbackEmail
  };
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function readBrowserSession(): BrowserSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as BrowserSession;
    return session.accessToken && session.refreshToken ? session : null;
  } catch {
    return null;
  }
}

export function clearBrowserSession() {
  window.localStorage.removeItem(SESSION_KEY);
}

export async function refreshBrowserSession(session = readBrowserSession()) {
  if (!session) return null;
  if (session.expiresAt > Date.now() + REFRESH_MARGIN_MS) return session;
  const { url, anonKey } = authConfig();
  const response = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: session.refreshToken })
  });
  if (!response.ok) {
    clearBrowserSession();
    return null;
  }
  return saveSession(await response.json() as AuthPayload, session.email);
}

export function captureRecoverySession() {
  if (typeof window === "undefined" || !window.location.hash) return null;
  const params = new URLSearchParams(window.location.hash.slice(1));
  if (params.get("type") !== "recovery") return null;
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  const expiresIn = Number(params.get("expires_in"));
  if (!accessToken || !refreshToken || !Number.isFinite(expiresIn)) return null;
  const session = saveSession({ access_token: accessToken, refresh_token: refreshToken, expires_in: expiresIn });
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  return session;
}

export async function signInWithPassword(email: string, password: string) {
  const { url, anonKey } = authConfig();
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  if (!response.ok) throw new Error("Email or password is incorrect.");
  return saveSession(await response.json() as AuthPayload, email);
}

export async function signUpWithPassword(email: string, password: string) {
  const { url, anonKey } = authConfig();
  const response = await fetch(`${url}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  if (!response.ok) throw new Error("Account could not be created.");
  const payload = await response.json() as Partial<AuthPayload>;
  if (!payload.access_token || !payload.refresh_token || !payload.expires_in) return null;
  return saveSession(payload as AuthPayload, email);
}

export async function requestPasswordReset(email: string) {
  const { url, anonKey } = authConfig();
  const response = await fetch(`${url}/auth/v1/recover?redirect_to=${encodeURIComponent(window.location.origin)}`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  });
  if (!response.ok) throw new Error("Password reset email could not be sent.");
}

export async function updatePassword(accessToken: string, password: string) {
  const { url, anonKey } = authConfig();
  const response = await fetch(`${url}/auth/v1/user`, {
    method: "PUT",
    headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ password })
  });
  if (!response.ok) throw new Error("Password could not be updated.");
}
