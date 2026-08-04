import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sampleModelData, sampleRequirements } from "@/domain/sampleData";

import { GET, POST } from "./route";

describe("POST /api/projects/:projectId/validations", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("reruns validation on the server and persists an evidence snapshot", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id: "user-1" }))
      .mockResolvedValueOnce(Response.json([{ owner_id: "user-1" }]))
      .mockResolvedValueOnce(Response.json([{ id: "run-1", project_id: "project-1" }]));
    const request = new Request("http://localhost/api/projects/project-1/validations", {
      method: "POST",
      headers: { authorization: "Bearer valid-token", "content-type": "application/json" },
      body: JSON.stringify({
        modelName: "terminal.ifc",
        model: sampleModelData,
        requirements: sampleRequirements
      })
    });

    const response = await POST(request, { params: Promise.resolve({ projectId: "project-1" }) });
    expect(response.status).toBe(201);
    const persisted = JSON.parse(String((fetchMock.mock.calls[2][1] as RequestInit).body));
    expect(persisted).toMatchObject({
      project_id: "project-1",
      owner_id: "user-1",
      created_by: "user-1",
      model_name: "terminal.ifc"
    });
    expect(persisted.results.length).toBeGreaterThan(0);
    expect(persisted.metrics.requirementCount).toBe(sampleRequirements.length);
    expect(persisted.metrics.assessments.length).toBe(sampleRequirements.length);
  });

  it("lists only validation metadata through the RLS-backed project filter", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id: "user-1" }))
      .mockResolvedValueOnce(Response.json([{ id: "run-1", model_name: "terminal.ifc" }]));
    const request = new Request("http://localhost/api/projects/project-1/validations", {
      headers: { authorization: "Bearer valid-token" }
    });
    const response = await GET(request, { params: Promise.resolve({ projectId: "project-1" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ validations: [{ id: "run-1", model_name: "terminal.ifc" }] });
    expect(fetchMock.mock.calls[1][0]).toContain("project_id=eq.project-1");
    expect(fetchMock.mock.calls[1][0]).not.toContain("normalized_model");
  });

  it("does not accept client-supplied results", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ id: "user-1" }));
    const request = new Request("http://localhost/api/projects/project-1/validations", {
      method: "POST",
      headers: { authorization: "Bearer valid-token", "content-type": "application/json" },
      body: JSON.stringify({
        modelName: "terminal.ifc",
        model: sampleModelData,
        requirements: sampleRequirements,
        results: [{ status: "pass" }]
      })
    });
    const response = await POST(request, { params: Promise.resolve({ projectId: "project-1" }) });
    expect(response.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
