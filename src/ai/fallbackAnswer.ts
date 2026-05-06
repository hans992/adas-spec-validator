import type { AdasChatRequest } from "@/ai/types";

const EVIDENCE_GUARDRAIL = "I cannot determine that from the available model evidence.";

function roleTone(role: AdasChatRequest["selectedRole"]): string {
  if (role === "Design Engineer") {
    return "Technical summary";
  }
  if (role === "Stockroom Personnel") {
    return "Operational summary";
  }
  return "Project status summary";
}

export function buildFallbackAnswer(input: AdasChatRequest): string {
  const passCount = input.validationResults.filter((item) => item.status === "pass").length;
  const failCount = input.validationResults.filter((item) => item.status === "fail").length;
  const unknownCount = input.validationResults.filter((item) => item.status === "unknown").length;

  const criticalFailures = input.validationResults.filter(
    (item) => item.status === "fail" && item.severity === "critical"
  );

  const lines: string[] = [];
  lines.push(`${roleTone(input.selectedRole)} based on deterministic validation evidence.`);
  lines.push(`Results: ${passCount} pass, ${failCount} fail, ${unknownCount} unknown.`);

  if (criticalFailures.length > 0) {
    const failureDetails = criticalFailures
      .map((item) => `${item.requirementId} (${item.affectedElementIds.join(", ")})`)
      .join("; ");
    lines.push(`Critical failures: ${failureDetails}.`);
  } else {
    lines.push("Critical failures: none in current deterministic results.");
  }

  if (unknownCount > 0) {
    const unknownIds = input.validationResults
      .filter((item) => item.status === "unknown")
      .flatMap((item) => item.affectedElementIds)
      .filter((value, index, all) => all.indexOf(value) === index);
    lines.push(`Unknown items require follow-up model data: ${unknownIds.join(", ")}.`);
    lines.push("Unknowns remain unknown until missing parameters or relationships are provided.");
  }

  if (
    /cannot determine|unknown|missing|insufficient|not sure/i.test(input.userQuestion) ||
    unknownCount > 0
  ) {
    lines.push(EVIDENCE_GUARDRAIL);
  }

  if (input.selectedRole === "Stockroom Personnel") {
    lines.push("Use spaces cautiously where failures or unknowns exist until engineering follow-up is complete.");
  } else if (input.selectedRole === "Project Manager") {
    lines.push("Follow-up priority: resolve critical failures first, then close unknown data gaps.");
  } else {
    lines.push("Reference requirement IDs and element IDs above when planning corrective action.");
  }

  return lines.join(" ");
}
