import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sampleRequirements } from "@/domain/sampleData";

import { GET, POST } from "./route";

const context = { params: Promise.resolve({ projectId: "project-1" }) };
const headers = { authorization: "Bearer token", "content-type": "application/json" };

describe("project specification library API", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

  it("lists complete packages through the project RLS boundary", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id: "user-1" }))
      .mockResolvedValueOnce(Response.json([{ id: "spec-1", name: "Terminal rules", revision: "A" }]));
    const response = await GET(new Request("http://localhost/specifications", { headers }), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ specifications: [{ id: "spec-1", revision: "A" }] });
    expect(fetchMock.mock.calls[1][0]).toContain("project_id=eq.project-1");
    expect(fetchMock.mock.calls[1][0]).toContain("requirements");
  });

  it("persists a validated immutable revision with owner and actor", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id: "editor-1" }))
      .mockResolvedValueOnce(Response.json([{ owner_id: "owner-1" }]))
      .mockResolvedValueOnce(Response.json([{ id: "spec-1" }]));
    const response = await POST(new Request("http://localhost/specifications", {
      method: "POST", headers, body: JSON.stringify({ name: "Terminal rules", revision: "A", requirements: sampleRequirements })
    }), context);
    expect(response.status).toBe(201);
    const body = JSON.parse(String((fetchMock.mock.calls[2][1] as RequestInit).body));
    expect(body).toMatchObject({ project_id: "project-1", owner_id: "owner-1", created_by: "editor-1", name: "Terminal rules", revision: "A" });
    expect(body.requirements).toHaveLength(sampleRequirements.length);
  });

  it("rejects malformed or duplicate requirement ids before persistence", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ id: "user-1" }));
    const duplicate = [...sampleRequirements, { ...sampleRequirements[0] }];
    const response = await POST(new Request("http://localhost/specifications", {
      method: "POST", headers, body: JSON.stringify({ name: "Rules", revision: "A", requirements: duplicate })
    }), context);
    expect(response.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
