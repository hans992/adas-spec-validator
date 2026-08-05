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
    expect(fetchMock.mock.calls[1][0]).toContain("document_source");
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

  it("persists optional document_source snapshots for DOCX provenance", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id: "editor-1" }))
      .mockResolvedValueOnce(Response.json([{ owner_id: "owner-1" }]))
      .mockResolvedValueOnce(Response.json([{ id: "spec-1" }]));
    const documentSource = {
      kind: "docx",
      fileName: "spec.docx",
      contentHash: "a".repeat(64),
      parserVersion: "1.0.0",
      metadata: { title: "Spec" },
      fragments: [{
        fragmentId: "frag_1",
        kind: "numbered_clause",
        exactText: "Doors shall be 0.85 m wide.",
        headingPath: ["Doors"],
        sourceAnchor: {
          kind: "paragraph",
          bodyIndex: 0,
          paragraphIndex: 0,
          startOffset: 0,
          endOffset: 27
        }
      }],
      unsupportedContent: [],
      trackChanges: { present: false, insertedRuns: 0, deletedRuns: 0, comments: 0 },
      fragmentRequirementMap: [{
        requirementId: sampleRequirements[0].id,
        fragmentIds: ["frag_1"],
        textRanges: [{ fragmentId: "frag_1", startOffset: 0, endOffset: 27, exactText: "Doors shall be 0.85 m wide." }]
      }]
    };
    const response = await POST(new Request("http://localhost/specifications", {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "Terminal rules",
        revision: "DOCX-A",
        requirements: sampleRequirements,
        documentSource
      })
    }), context);
    expect(response.status).toBe(201);
    const body = JSON.parse(String((fetchMock.mock.calls[2][1] as RequestInit).body));
    expect(body.document_source).toMatchObject({ kind: "docx", fileName: "spec.docx", parserVersion: "1.0.0" });
    expect(body.documentSource).toBeUndefined();
  });

  it("preserves extended requirement metadata in the single atomic insert", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id: "editor-1" }))
      .mockResolvedValueOnce(Response.json([{ owner_id: "owner-1" }]))
      .mockResolvedValueOnce(Response.json([{ id: "spec-1" }]));
    const requirement = {
      ...sampleRequirements[0],
      description: "Measured clear area requirement",
      discipline: "Architecture",
      elementType: "stockroom",
      quantityType: "area",
      unit: "m²",
      notes: "Imported from the issued workbook",
      automationStatus: "ready_for_validation"
    };
    const response = await POST(new Request("http://localhost/specifications", {
      method: "POST", headers, body: JSON.stringify({ name: "Terminal rules", revision: "B", requirements: [requirement] })
    }), context);
    expect(response.status).toBe(201);
    const body = JSON.parse(String((fetchMock.mock.calls[2][1] as RequestInit).body));
    expect(body.requirements[0]).toMatchObject({
      discipline: "Architecture",
      quantityType: "area",
      unit: "m²",
      automationStatus: "ready_for_validation"
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([403, 409])("does not retry or partially write when Supabase returns %s", async (status) => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id: "viewer-1" }))
      .mockResolvedValueOnce(Response.json([{ owner_id: "owner-1" }]))
      .mockResolvedValueOnce(Response.json({ message: status === 409 ? "duplicate key" : "permission denied" }, { status }));
    const response = await POST(new Request("http://localhost/specifications", {
      method: "POST", headers, body: JSON.stringify({ name: "Terminal rules", revision: "A", requirements: sampleRequirements })
    }), context);
    expect(response.status).toBe(status);
    expect(fetchMock).toHaveBeenCalledTimes(3);
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
