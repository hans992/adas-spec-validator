import { NextResponse } from "next/server";
import { z } from "zod";

import { documentFragmentSchema } from "@/domain/schemas";
import { validateCitationQuotes } from "@/domain/specificationDocxDrafts";

export const runtime = "nodejs";

const citationSchema = z.object({
  fragmentId: z.string().min(1).max(120),
  quotes: z.array(z.object({
    startOffset: z.number().int().nonnegative(),
    endOffset: z.number().int().nonnegative(),
    exactText: z.string().max(20_000)
  }).strict()).min(1).max(20)
}).strict();

const suggestionSchema = z.object({
  draftId: z.string().min(1).max(120),
  requirementId: z.string().min(1).max(100),
  title: z.string().min(1).max(300),
  description: z.string().min(1).max(20_000),
  fragments: z.array(citationSchema).min(1).max(20)
}).strict();

const requestSchema = z.object({
  fragments: z.array(documentFragmentSchema).min(1).max(20_000),
  suggestions: z.array(suggestionSchema).max(200).default([])
}).strict();

export async function POST(request: Request) {
  try {
    const payload = requestSchema.parse(await request.json());
    const accepted = [];
    const rejected = [];

    for (const suggestion of payload.suggestions) {
      const citationErrors = validateCitationQuotes(payload.fragments, suggestion.fragments);
      if (citationErrors.length > 0) {
        rejected.push({ suggestion, errors: citationErrors });
        continue;
      }
      accepted.push(suggestion);
    }

    // Deterministic, non-LLM helper: propose grouping only when the caller sent no suggestions.
    const heuristics = payload.suggestions.length === 0
      ? payload.fragments
        .filter((fragment) => fragment.kind === "mandatory_candidate")
        .slice(0, 20)
        .map((fragment, index) => ({
          draftId: `ai-heuristic-${index + 1}`,
          requirementId: `AI-${String(index + 1).padStart(3, "0")}`,
          title: fragment.exactText.slice(0, 120),
          description: fragment.exactText,
          fragments: [{
            fragmentId: fragment.fragmentId,
            quotes: [{
              startOffset: 0,
              endOffset: fragment.exactText.length,
              exactText: fragment.exactText
            }]
          }]
        }))
      : [];

    return NextResponse.json({
      mode: payload.suggestions.length > 0 ? "validate" : "heuristic",
      accepted,
      rejected,
      suggestions: heuristics,
      note: "AI suggestions are non-authoritative drafts. Humans must approve sources before confirmation. Provider LLM structuring can be layered later without changing this citation contract."
    });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid DOCX suggestion payload.", details: error instanceof z.ZodError ? error.issues : undefined }, { status: 400 });
    }
    return NextResponse.json({ error: "Unexpected DOCX suggestion route error." }, { status: 500 });
  }
}
