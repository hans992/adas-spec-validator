import type { Metadata } from "next";
import { DocPage } from "@/components/DocPage";
import { aiTransparency } from "@/content/betaDocs";

export const metadata: Metadata = { title: "AI transparency — AEC Spec Validator" };

export default function AiTransparencyPage() {
  return (
    <DocPage
      title="AI transparency"
      subtitle="Deterministic validation is authoritative; AI only explains verified findings."
      sections={aiTransparency}
      related={[{ href: "/docs/validation-limitations", label: "Validation limitations" }]}
    />
  );
}
