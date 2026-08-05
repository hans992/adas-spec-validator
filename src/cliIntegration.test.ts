import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

function runCli(args: string[], env: Record<string, string | undefined>): Promise<{
  code: number | null;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(process.cwd(), "bin", "aec-validator.mjs"), ...args], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

describe("aec-validator CLI", () => {
  it("uploads assets, compares baseline, blocks on critical regression, and writes artifacts", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "aec-cli-"));
    temporaryDirectories.push(directory);
    const modelPath = path.join(directory, "building.ifc");
    const specPath = path.join(directory, "requirements.xlsx");
    const jsonPath = path.join(directory, "report.json");
    const csvPath = path.join(directory, "report.csv");
    const sarifPath = path.join(directory, "report.sarif");
    await writeFile(modelPath, "IFC fixture");
    await writeFile(specPath, "XLSX fixture");

    const run = {
      id: "run-1",
      project_id: "project-1",
      model_name: "building.ifc",
      status: "completed",
      metrics: { passRate: 0, coverage: 100, criticalFailures: 1, unknownRequirements: 0 },
      requirements: [{
        id: "REQ-1", title: "Critical", type: "room_has_connected_door", severity: "critical"
      }],
      results: [{
        ruleId: "rule-1",
        requirementId: "REQ-1",
        requirementTitle: "Critical",
        elementType: "room",
        status: "fail",
        severity: "critical",
        summary: "Critical regression",
        affectedElementIds: ["R-1"],
        evidence: []
      }]
    };
    const comparison = {
      gate: {
        status: "block",
        violations: [{ severity: "block", message: "New critical finding." }]
      },
      findingCounts: { new: 1, reopened: 0, resolved: 0 }
    };

    const server = createServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://localhost");
      response.setHeader("Content-Type", "application/json");
      if (request.method === "POST" && url.pathname.endsWith("/models")) {
        response.end(JSON.stringify({ data: { model: { id: "model-1" } } }));
      } else if (request.method === "POST" && url.pathname.endsWith("/specifications")) {
        response.end(JSON.stringify({ data: { specification: { id: "spec-1" } } }));
      } else if (request.method === "POST" && url.pathname.endsWith("/validation-runs")) {
        response.end(JSON.stringify({ data: { run: { id: "run-1" }, regression: comparison } }));
      } else if (url.pathname.endsWith("/comparison")) {
        response.end(JSON.stringify({ data: { comparison } }));
      } else if (url.searchParams.get("format") === "csv") {
        response.setHeader("Content-Type", "text/csv");
        response.end("run_id,status\r\nrun-1,fail");
      } else if (url.searchParams.get("format") === "sarif") {
        response.end(JSON.stringify({ version: "2.1.0", runs: [] }));
      } else if (url.pathname.endsWith("/validation-runs/run-1")) {
        response.end(JSON.stringify({ data: { run } }));
      } else {
        response.statusCode = 404;
        response.end(JSON.stringify({ error: { message: "not found" } }));
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind.");

    try {
      const result = await runCli([
        "validate",
        "--model", modelPath,
        "--spec", specPath,
        "--baseline", "main",
        "--fail-on", "critical",
        "--json", jsonPath,
        "--csv", csvPath,
        "--sarif", sarifPath
      ], {
        AEC_API_URL: `http://127.0.0.1:${address.port}`,
        AEC_API_TOKEN: "aec_test",
        AEC_PROJECT_ID: "project-1"
      });
      expect(result.code).toBe(1);
      expect(result.stdout).toContain("Baseline gate: BLOCK");
      expect(result.stderr).toBe("");
      expect(JSON.parse(await readFile(jsonPath, "utf8")).comparison.gate.status).toBe("block");
      expect(await readFile(csvPath, "utf8")).toContain("run-1,fail");
      expect(JSON.parse(await readFile(sarifPath, "utf8")).version).toBe("2.1.0");
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it("uses exit code 2 for invalid CLI usage", async () => {
    const result = await runCli(["validate"], {});
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("--model and --spec are required");
  });
});
