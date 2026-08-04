import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  captureRecoverySession,
  readBrowserSession,
  refreshBrowserSession,
  signUpWithPassword
} from "./browserSession";

function browserMock(hash = "") {
  const values = new Map<string, string>();
  const replaceState = vi.fn();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key)
    },
    location: { hash, pathname: "/", search: "", origin: "https://adas.example" },
    history: { replaceState }
  });
  return { replaceState };
}

describe("browser authentication session", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    browserMock();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps signup pending when email confirmation is required", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ user: { email: "new@example.com" } }), { status: 200 })));

    await expect(signUpWithPassword("new@example.com", "password123")).resolves.toBeNull();
    expect(readBrowserSession()).toBeNull();
  });

  it("rotates an expired access and refresh token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: "new-access",
      refresh_token: "new-refresh",
      expires_in: 3600,
      user: { email: "user@example.com" }
    }), { status: 200 })));

    const refreshed = await refreshBrowserSession({ accessToken: "old", refreshToken: "old-refresh", expiresAt: 0, email: "user@example.com" });

    expect(refreshed?.accessToken).toBe("new-access");
    expect(readBrowserSession()?.refreshToken).toBe("new-refresh");
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("grant_type=refresh_token"), expect.objectContaining({ method: "POST" }));
  });

  it("captures a recovery session and removes tokens from the URL", () => {
    const { replaceState } = browserMock("#access_token=recovery-access&refresh_token=recovery-refresh&expires_in=3600&type=recovery");

    const session = captureRecoverySession();

    expect(session?.accessToken).toBe("recovery-access");
    expect(readBrowserSession()?.refreshToken).toBe("recovery-refresh");
    expect(replaceState).toHaveBeenCalledWith(null, "", "/");
  });
});
