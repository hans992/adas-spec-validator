import { describe, expect, it, vi } from "vitest";

import { POST } from "./route";

describe("POST /api/docx/suggest", () => {
  it("rejects citations that point at the wrong fragment", async () => {
    const fragment = {
      fragmentId: "frag_abc",
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
    };
    const response = await POST(new Request("http://localhost/api/docx/suggest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fragments: [fragment],
        suggestions: [{
          draftId: "d1",
          requirementId: "R1",
          title: "Door width",
          description: "Doors shall be 0.85 m wide.",
          fragments: [{
            fragmentId: "frag_missing",
            quotes: [{ startOffset: 0, endOffset: 27, exactText: "Doors shall be 0.85 m wide." }]
          }]
        }]
      })
    }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.rejected).toHaveLength(1);
    expect(body.accepted).toHaveLength(0);
  });

  it("returns heuristic suggestions when none are supplied", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const fragment = {
      fragmentId: "frag_abc",
      kind: "mandatory_candidate",
      exactText: "Escape routes must remain clear.",
      headingPath: ["Life safety"],
      sourceAnchor: {
        kind: "paragraph",
        bodyIndex: 1,
        paragraphIndex: 1,
        startOffset: 0,
        endOffset: 32
      }
    };
    const response = await POST(new Request("http://localhost/api/docx/suggest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fragments: [fragment] })
    }));
    const body = await response.json();
    expect(body.mode).toBe("heuristic");
    expect(body.suggestions).toHaveLength(1);
    expect(body.suggestions[0].fragments[0].fragmentId).toBe("frag_abc");
  });
});
