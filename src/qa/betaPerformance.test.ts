import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseIfcBytes } from "@/domain/ifcParser";
import { validateWithDeterministicRules } from "@/domain/validationPipeline";
import { sampleRequirements } from "@/domain/sampleData";
import { assertUploadedFile } from "@/security/uploadGuards";

const fixtures = join(process.cwd(), "test", "fixtures");

describe("beta performance and upload load smoke", () => {
  it("parses the minimal IFC fixture within 5s and validates against sample rules", async () => {
    const bytes = new Uint8Array(readFileSync(join(fixtures, "minimal-building.ifc")));
    const started = Date.now();
    const parsed = await parseIfcBytes(bytes);
    const elapsed = Date.now() - started;
    expect(elapsed).toBeLessThan(5_000);
    expect(parsed.model.rooms.length).toBeGreaterThan(0);
    const validated = validateWithDeterministicRules(parsed.model, sampleRequirements);
    expect(validated.results.length).toBeGreaterThan(0);
  });

  it("parses IFC2X3 and millimetre fixtures under the beta budget", async () => {
    for (const name of ["ifc2x3-building.ifc", "millimetre-property-building.ifc"]) {
      const bytes = new Uint8Array(readFileSync(join(fixtures, name)));
      const started = Date.now();
      const parsed = await parseIfcBytes(bytes);
      expect(Date.now() - started, name).toBeLessThan(5_000);
      expect(parsed.model.levels.length).toBeGreaterThan(0);
    }
  });

  it("rejects disguised uploads while accepting a real IFC under repeated checks", () => {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
    const ifc = new Uint8Array(readFileSync(join(fixtures, "minimal-building.ifc")));
    for (let i = 0; i < 25; i += 1) {
      const bad = assertUploadedFile({
        kind: "ifc",
        fileName: `evil-${i}.ifc`,
        mimeType: "application/octet-stream",
        bytes: zip
      });
      expect(bad.ok).toBe(false);
      const good = assertUploadedFile({
        kind: "ifc",
        fileName: `ok-${i}.ifc`,
        mimeType: "application/octet-stream",
        bytes: ifc
      });
      expect(good.ok).toBe(true);
    }
  });
});
