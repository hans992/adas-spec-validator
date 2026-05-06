import { describe, expect, it } from "vitest";
import { sampleModelData, sampleRequirements } from "@/domain/sampleData";
import {
  parseUploadedJson,
  validateUploadedModel,
  validateUploadedRequirements
} from "@/domain/uploadHelpers";
import { validateWithDeterministicRules } from "@/domain/validationPipeline";

describe("upload helpers", () => {
  it("parses valid JSON", () => {
    const result = parseUploadedJson(JSON.stringify(sampleModelData));
    expect(result.success).toBe(true);
  });

  it("returns error for invalid JSON", () => {
    const result = parseUploadedJson("{ this is not json");
    expect(result.success).toBe(false);
  });

  it("validates uploaded model shape", () => {
    const result = validateUploadedModel(sampleModelData);
    expect(result.success).toBe(true);
  });

  it("returns schema error for invalid requirements shape", () => {
    const result = validateUploadedRequirements([{ foo: "bar" }]);
    expect(result.success).toBe(false);
  });

  it("validation pipeline works with uploaded-shaped data", () => {
    const result = validateWithDeterministicRules(sampleModelData, sampleRequirements);
    expect(result.results.length).toBeGreaterThan(0);
  });
});
