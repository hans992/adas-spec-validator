import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { POST } from "./route";

describe("POST /api/ifc", () => {
  it("parses an uploaded IFC2x3 file through the public API boundary", async () => {
    const bytes = await readFile(resolve(process.cwd(), "test/fixtures/ifc2x3-building.ifc"));
    const formData = new FormData();
    formData.append("file", new File([bytes], "building.ifc", { type: "application/octet-stream" }));

    const response = await POST(new Request("http://localhost/api/ifc", { method: "POST", body: formData }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.diagnostics).toMatchObject({ schema: expect.stringContaining("IFC2X3"), spacesFound: 1, doorsFound: 1 });
    expect(payload.model.rooms[0]).toMatchObject({ areaSqm: 18.25, roomType: "meeting_room" });
    expect(payload.model.doors[0]).toMatchObject({ widthM: 1 });
  });

  it("rejects non-IFC uploads at the API boundary", async () => {
    const formData = new FormData();
    formData.append("file", new File(["{}"], "building.json", { type: "application/json" }));

    const response = await POST(new Request("http://localhost/api/ifc", { method: "POST", body: formData }));
    expect(response.status).toBe(415);
  });
});
