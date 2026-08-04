import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

const headers = { authorization: "Bearer token", "content-type": "application/json" };
describe("invitation acceptance API", () => {
  beforeEach(() => { vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon"); });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

  it("lists only current pending invitations exposed by RLS", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ id: "user-1" })).mockResolvedValueOnce(Response.json([]));
    const response = await GET(new Request("http://localhost/invitations", { headers }));
    expect(response.status).toBe(200); expect(fetchMock.mock.calls[1][0]).toContain("status=eq.pending&expires_at=gt.now()");
  });

  it("accepts through the atomic security-definer RPC", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ id: "user-1" })).mockResolvedValueOnce(Response.json("project-1"));
    const response = await POST(new Request("http://localhost/invitations", { method: "POST", headers, body: JSON.stringify({ invitationId: "invite-1" }) }));
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ projectId: "project-1" });
    expect(fetchMock.mock.calls[1][0]).toContain("/rest/v1/rpc/accept_project_invitation");
  });
});
