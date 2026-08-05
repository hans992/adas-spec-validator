"use client";

import {
  readBrowserSession,
  refreshBrowserSession,
  type BrowserSession
} from "@/persistence/browserSession";

export async function authenticatedBrowserApi<T>(
  path: string,
  init: RequestInit = {},
  session: BrowserSession | null = readBrowserSession(),
  onSession?: (session: BrowserSession | null) => void
): Promise<T> {
  const activeSession = await refreshBrowserSession(session);
  if (!activeSession) {
    onSession?.(null);
    throw new Error("Your session expired. Please sign in again.");
  }
  if (activeSession.accessToken !== session?.accessToken) onSession?.(activeSession);
  const request = (accessToken: string) => fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers ?? {})
    }
  });
  let response = await request(activeSession.accessToken);
  if (response.status === 401) {
    const refreshed = await refreshBrowserSession({ ...activeSession, expiresAt: 0 });
    if (!refreshed) {
      onSession?.(null);
      throw new Error("Your session expired. Please sign in again.");
    }
    onSession?.(refreshed);
    response = await request(refreshed.accessToken);
  }
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "The request failed.");
  return payload as T;
}
