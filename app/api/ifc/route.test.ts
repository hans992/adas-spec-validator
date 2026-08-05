import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { resetRateLimitForTests } from "@/security/rateLimit";
import { POST } from "./route";

describe("POST /api/ifc", () => {
  beforeEach(() => {
    resetRateLimitForTests();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
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

  it("rejects a renamed binary that fails the magic-byte check", async () => {
    const formData = new FormData();
    formData.append("file", new File([new Uint8Array([0x4d, 0x5a, 0x90, 0x00])], "malware.ifc", { type: "application/octet-stream" }));

    const response = await POST(new Request("http://localhost/api/ifc", { method: "POST", body: formData }));
    expect(response.status).toBe(415);
    expect((await response.json()).error).toContain("does not match");
  });

  it("rejects a ZIP container renamed to .ifc", async () => {
    const formData = new FormData();
    formData.append("file", new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00])], "bomb.ifc", { type: "" }));

    const response = await POST(new Request("http://localhost/api/ifc", { method: "POST", body: formData }));
    expect(response.status).toBe(415);
  });

  it("rate limits upload floods with Retry-After", async () => {
    // The limiter runs before any parsing, so cheap rejected bodies are enough.
    const makeRequest = () => {
      const formData = new FormData();
      formData.append("file", new File([new Uint8Array([0x4d, 0x5a])], "flood.ifc", { type: "" }));
      return new Request("http://localhost/api/ifc", {
        method: "POST",
        headers: { "x-forwarded-for": "198.51.100.50" },
        body: formData
      });
    };
    let last: Response | null = null;
    for (let i = 0; i < 13; i += 1) {
      last = await POST(makeRequest());
    }
    expect(last?.status).toBe(429);
    expect(Number(last?.headers.get("Retry-After"))).toBeGreaterThan(0);
  });
});
