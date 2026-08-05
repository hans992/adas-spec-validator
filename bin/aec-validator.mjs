#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const EXIT = { ok: 0, validation: 1, usage: 2, infrastructure: 3 };

function usage(message) {
  if (message) console.error(`Error: ${message}\n`);
  console.error(`Usage:
  aec-validator validate --model building.ifc --spec requirements.xlsx [options]

Options:
  --api-url URL       API base URL (or AEC_API_URL)
  --token TOKEN       Project API token (or AEC_API_TOKEN)
  --project ID        Project UUID (or AEC_PROJECT_ID)
  --baseline main     Compare with the configured project baseline
  --fail-on LEVEL     critical|warning|unknown|gate|none (default: gate)
  --format FORMAT     human|json|csv|sarif (default: human)
  --output PATH       Write primary output to a file
  --json PATH         Also write JSON run/comparison artifact
  --csv PATH          Also write CSV artifact
  --sarif PATH        Also write SARIF artifact
  --help              Show this help`);
}

function parseArgs(argv) {
  if (argv.includes("--help") || argv.length === 0) return { help: true };
  const command = argv[0];
  if (command !== "validate") throw new Error(`Unknown command '${command}'.`);
  const result = { command, format: "human", failOn: "gate" };
  const names = {
    "--model": "model",
    "--spec": "spec",
    "--api-url": "apiUrl",
    "--token": "token",
    "--project": "project",
    "--baseline": "baseline",
    "--fail-on": "failOn",
    "--format": "format",
    "--output": "output",
    "--json": "json",
    "--csv": "csv",
    "--sarif": "sarif"
  };
  for (let index = 1; index < argv.length; index += 2) {
    const key = names[argv[index]];
    const value = argv[index + 1];
    if (!key || value === undefined) throw new Error(`Invalid option '${argv[index]}'.`);
    result[key] = value;
  }
  result.apiUrl ??= process.env.AEC_API_URL;
  result.token ??= process.env.AEC_API_TOKEN;
  result.project ??= process.env.AEC_PROJECT_ID;
  if (!result.model || !result.spec) throw new Error("--model and --spec are required.");
  if (!result.apiUrl || !result.token || !result.project) {
    throw new Error("--api-url, --token, and --project (or matching AEC_* variables) are required.");
  }
  if (!["human", "json", "csv", "sarif"].includes(result.format)) {
    throw new Error("--format must be human, json, csv, or sarif.");
  }
  if (!["critical", "warning", "unknown", "gate", "none"].includes(result.failOn)) {
    throw new Error("--fail-on must be critical, warning, unknown, gate, or none.");
  }
  if (result.baseline && result.baseline !== "main") {
    throw new Error("--baseline currently supports only 'main'.");
  }
  result.apiUrl = result.apiUrl.replace(/\/$/, "");
  return result;
}

async function hashFile(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function request(options, path, init = {}, raw = false) {
  const response = await fetch(`${options.apiUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${options.token}`,
      ...(init.headers ?? {})
    }
  });
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const payload = await response.json();
      message = payload.error?.message ?? payload.error ?? message;
    } catch {}
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return raw ? await response.text() : await response.json();
}

async function upload(options, kind, path) {
  const bytes = await readFile(path);
  const form = new FormData();
  form.set("file", new File([bytes], basename(path)));
  const hash = await hashFile(path);
  const response = await request(
    options,
    `/api/v1/projects/${encodeURIComponent(options.project)}/${kind}`,
    {
      method: "POST",
      headers: { "Idempotency-Key": `${kind}-${hash}` },
      body: form
    }
  );
  return response.data;
}

function humanReport(run, comparison) {
  const metrics = run.metrics ?? {};
  const lines = [
    `AEC validation ${run.id}`,
    `Model: ${run.model_name}`,
    `Status: ${run.status}`,
    `Pass rate: ${metrics.passRate ?? "—"}%`,
    `Evaluation coverage: ${metrics.coverage ?? "—"}%`,
    `Results: ${run.results?.length ?? 0}`,
    `Critical failures: ${metrics.criticalFailures ?? 0}`,
    `Unknown requirements: ${metrics.unknownRequirements ?? 0}`
  ];
  if (comparison) {
    lines.push(
      "",
      `Baseline gate: ${String(comparison.gate?.status ?? "unknown").toUpperCase()}`,
      `New findings: ${comparison.findingCounts?.new ?? 0}`,
      `Reopened findings: ${comparison.findingCounts?.reopened ?? 0}`,
      `Resolved findings: ${comparison.findingCounts?.resolved ?? 0}`
    );
    for (const violation of comparison.gate?.violations ?? []) {
      lines.push(`  [${violation.severity}] ${violation.message}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function thresholdFailed(run, comparison, failOn) {
  if (comparison?.gate?.status === "block") return true;
  if (failOn === "none") return false;
  if (failOn === "gate") return comparison?.gate?.status === "block";
  const results = run.results ?? [];
  if (failOn === "unknown") return results.some((result) => result.status === "unknown");
  if (failOn === "critical") {
    return results.some((result) => result.status === "fail" && result.severity === "critical");
  }
  return results.some((result) =>
    result.status === "fail" && (result.severity === "critical" || result.severity === "warning")
  );
}

async function write(path, content) {
  await writeFile(resolve(path), content);
}

async function validate(options) {
  const model = await upload(options, "models", options.model);
  const specification = await upload(options, "specifications", options.spec);
  const runKey = createHash("sha256")
    .update(`${model.model.id}:${specification.specification.id}`)
    .digest("hex");
  const created = await request(
    options,
    `/api/v1/projects/${encodeURIComponent(options.project)}/validation-runs`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": `run-${runKey}`
      },
      body: JSON.stringify({
        modelId: model.model.id,
        specificationId: specification.specification.id
      })
    }
  );
  const runId = created.data.run.id;
  const runPayload = await request(
    options,
    `/api/v1/projects/${encodeURIComponent(options.project)}/validation-runs/${encodeURIComponent(runId)}`
  );
  const run = runPayload.data.run;
  let comparison = created.data.regression ?? null;
  if (options.baseline === "main") {
    const compared = await request(
      options,
      `/api/v1/projects/${encodeURIComponent(options.project)}/validation-runs/${encodeURIComponent(runId)}/comparison?baseline=main`
    );
    comparison = compared.data.comparison;
  }

  const json = `${JSON.stringify({ run, comparison }, null, 2)}\n`;
  const artifact = async (format) => request(
    options,
    `/api/v1/projects/${encodeURIComponent(options.project)}/validation-runs/${encodeURIComponent(runId)}?format=${format}`,
    {},
    true
  );
  if (options.json) await write(options.json, json);
  if (options.csv) await write(options.csv, await artifact("csv"));
  if (options.sarif) await write(options.sarif, await artifact("sarif"));

  let primary;
  if (options.format === "json") primary = json;
  else if (options.format === "csv") primary = await artifact("csv");
  else if (options.format === "sarif") primary = await artifact("sarif");
  else primary = humanReport(run, comparison);
  if (options.output) await write(options.output, primary);
  else process.stdout.write(primary);

  return thresholdFailed(run, comparison, options.failOn) ? EXIT.validation : EXIT.ok;
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    usage(error.message);
    return EXIT.usage;
  }
  if (options.help) {
    usage();
    return EXIT.ok;
  }
  try {
    return await validate(options);
  } catch (error) {
    console.error(`AEC validation failed: ${error.message}`);
    return error.status === 400 || error.status === 422 ? EXIT.usage : EXIT.infrastructure;
  }
}

process.exitCode = await main();
