import type { AdasChatRequest } from "@/ai/types";

function roleInstruction(selectedRole: AdasChatRequest["selectedRole"]): string {
  switch (selectedRole) {
    case "Design Engineer":
      return "Use technical and precise language. Mention requirement IDs and element IDs. Explain observed vs expected values.";
    case "Stockroom Personnel":
      return "Use simple operational language. Avoid unnecessary jargon. Explain whether spaces seem usable based on validated evidence.";
    case "Project Manager":
      return "Be concise and risk-focused. Highlight failures and unknowns, and what needs follow-up.";
    default:
      return "Use evidence-constrained language.";
  }
}

export function buildAdasPrompt(input: AdasChatRequest): string {
  const facts = JSON.stringify(input.normalizedModel, null, 2);
  const results = JSON.stringify(input.validationResults, null, 2);

  return [
    `Selected role: ${input.selectedRole}`,
    `Role behavior instructions: ${roleInstruction(input.selectedRole)}`,
    "",
    "Response style requirements:",
    "- Be concise by default and answer the user's specific question directly.",
    "- Prefer 3-6 bullets for summaries.",
    "- Prioritize fail and unknown findings over pass findings.",
    "- Do not dump the full model or all evidence unless explicitly asked.",
    '- If the question is vague (for example: "What is this?", "What is what?", "Explain this"), provide a brief system-oriented clarification and suggest 2-3 better follow-up questions.',
    "",
    "Anti-hallucination reminders:",
    "- Do not infer missing data.",
    "- Do not invent elements, measurements, or relationships.",
    "- Do not change deterministic pass/fail/unknown outcomes.",
    '- If support is insufficient, answer: "I cannot determine that from the available model evidence."',
    "",
    "Available normalized model facts (authoritative input):",
    facts,
    "",
    "Available deterministic validation results and evidence (authoritative input):",
    results,
    "",
    `User question: ${input.userQuestion}`,
    "",
    "Answer using only the provided evidence. Include element IDs and requirement IDs in claims where relevant."
  ].join("\n");
}
