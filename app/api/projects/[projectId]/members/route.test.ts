import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET, PATCH, POST } from "./route";

const context = { params: Promise.resolve({ projectId: "11111111-1111-4111-8111-111111111111" }) };
const auth = { authorization: "Bearer token", "content-type": "application/json" };

describe("project collaboration API", () => {
  beforeEach(() => { vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon"); });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

  it("lists members and pending invitations", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ id: "owner-1" })).mockResolvedValueOnce(Response.json([{ user_id: "member-1", role: "editor" }])).mockResolvedValueOnce(Response.json([{ id: "invite-1", email: "user@example.com" }]));
    const response = await GET(new Request("http://localhost/members", { headers: auth }), context);
    expect(response.status).toBe(200); expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(await response.json()).toMatchObject({ members: [{ role: "editor" }], invitations: [{ email: "user@example.com" }] });
  });

  it("normalizes an invitation email and fixes expiry server-side", async () => {
    vi.stubEnv("FORCE_ACCOUNT_PLAN", "professional");
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id: "owner-1" }))
      .mockResolvedValueOnce(Response.json([])) // members for seat count
      .mockResolvedValueOnce(Response.json([{ id: "invite-1" }]));
    const response = await POST(new Request("http://localhost/members", { method: "POST", headers: auth, body: JSON.stringify({ email: " USER@Example.com ", role: "viewer" }) }), context);
    expect(response.status).toBe(201);
    const body = JSON.parse(String((fetchMock.mock.calls[2][1] as RequestInit).body));
    expect(body).toMatchObject({ email: "user@example.com", role: "viewer", owner_id: "owner-1", status: "pending" });
    expect(new Date(body.expires_at).getTime()).toBeGreaterThan(Date.now() + 6 * 86400000);
  });

  it("rejects privileged or malformed roles", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ id: "owner-1" }));
    const response = await POST(new Request("http://localhost/members", { method: "POST", headers: auth, body: JSON.stringify({ email: "user@example.com", role: "owner" }) }), context);
    expect(response.status).toBe(400); expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("updates only a validated member role", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ id: "owner-1" })).mockResolvedValueOnce(Response.json([{ user_id: "22222222-2222-4222-8222-222222222222", role: "viewer" }]));
    const response = await PATCH(new Request("http://localhost/members", { method: "PATCH", headers: auth, body: JSON.stringify({ userId: "22222222-2222-4222-8222-222222222222", role: "viewer" }) }), context);
    expect(response.status).toBe(200); expect(fetchMock.mock.calls[1][0]).toContain("user_id=eq.22222222-2222-4222-8222-222222222222");
  });

  it("removes an explicitly identified member", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ id: "owner-1" })).mockResolvedValueOnce(new Response(null, { status: 204 }));
    const response = await DELETE(new Request("http://localhost/members?userId=22222222-2222-4222-8222-222222222222", { method: "DELETE", headers: auth }), context);
    expect(response.status).toBe(204); expect(fetchMock.mock.calls[1][0]).toContain("user_id=eq.22222222-2222-4222-8222-222222222222");
  });
});
