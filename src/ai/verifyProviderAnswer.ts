import { providerAnswerSchema, type ProviderAnswer, type TrustedAecChatInput } from "@/ai/types";

export function parseAndVerifyProviderAnswer(
  rawContent: string,
  input: TrustedAecChatInput
): ProviderAnswer | null {
  let payload: unknown;
  try {
    payload = JSON.parse(rawContent);
  } catch {
    return null;
  }

  const parsed = providerAnswerSchema.safeParse(payload);
  if (!parsed.success) return null;

  const resultsByRequirement = new Map<string, Set<string>>();
  for (const result of input.validationResults) {
    const ids = resultsByRequirement.get(result.requirementId) ?? new Set<string>();
    result.affectedElementIds.forEach((id) => ids.add(id));
    resultsByRequirement.set(result.requirementId, ids);
  }

  for (const citation of parsed.data.citations) {
    const allowedElementIds = resultsByRequirement.get(citation.requirementId);
    if (allowedElementIds === undefined) return null;
    if (citation.elementIds.some((id) => !allowedElementIds.has(id))) return null;
  }

  return parsed.data;
}
