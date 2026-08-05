import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

const headers = { authorization: "Bearer valid-token" };
const context = { params: Promise.resolve({ projectId: "project-1" }) };

const baseline = {
  id: "base-1",
  model_name: "baseline.ifc",
  created_at: "2026-08-01T10:00:00Z",
  normalized_model: { levels: [{ id: "l1", name: "L1" }], rooms: [{ id: "r0", name: "R0", levelId: "l1", roomType: "office" }], doors: [] },
  requirements: [{ id: "a", title: "A", type: "room_has_connected_door", severity: "critical" }],
  results: [{
    ruleId: "rule-a", requirementId: "a", requirementTitle: "A", elementType: "room",
    status: "pass", severity: "critical", summary: "ok", affectedElementIds: ["r0"], evidence: []
  }]
};

const candidate = {
  ...baseline,
  id: "cand-1",
  model_name: "candidate.ifc",
  results: [{
    ruleId: "rule-a", requirementId: "a", requirementTitle: "A", elementType: "room",
    status: "fail", severity: "critical", summary: "broken", affectedElementIds: ["r0"], evidence: []
  }]
};

describe("/api/projects/[projectId]/regression", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("requires candidateId", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ id: "user-1" }));
    const response = await GET(new Request("http://localhost/api/projects/project-1/regression", { headers }), context);
    expect(response.status).toBe(400);
  });

  it("returns 409 when no baseline is configured", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id: "user-1" }))
      .mockResolvedValueOnce(Response.json([{ id: "project-1", baseline_validation_id: null, release_policy: {} }]));

    const response = await GET(
      new Request("http://localhost/api/projects/project-1/regression?candidateId=cand-1", { headers }),
      context
    );
    expect(response.status).toBe(409);
  });

  it("returns a deterministic block gate for a new critical failure versus baseline", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id: "user-1" }))
      .mockResolvedValueOnce(Response.json([{
        id: "project-1",
        baseline_validation_id: "base-1",
        release_policy: {
          blockOnNewCritical: true,
          blockOnDecreasedCoverage: true,
          warnOnNewUnknown: true,
          allowWaivedCritical: false,
          maxHighFindings: null,
          maxMediumFindings: null
        }
      }]))
      .mockResolvedValueOnce(Response.json([baseline]))
      .mockResolvedValueOnce(Response.json([candidate]))
      .mockResolvedValueOnce(Response.json([]));

    const response = await GET(
      new Request("http://localhost/api/projects/project-1/regression?candidateId=cand-1", { headers }),
      context
    );
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.report.gate.status).toBe("block");
    expect(payload.report.findingCounts.reopened).toBe(1);
    expect(payload.report.baselineId).toBe("base-1");
    expect(payload.report.candidateId).toBe("cand-1");
  });
});
