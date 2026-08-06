import type { Metadata } from "next";
import { DocPage } from "@/components/DocPage";
import { validationLimitations } from "@/content/betaDocs";

export const metadata: Metadata = { title: "Validation limitations — AEC Spec Validator" };

export default function LimitationsPage() {
  return (
    <DocPage
      title="Validation limitations"
      subtitle="What the deterministic engine covers — and what it does not claim."
      sections={validationLimitations}
      related={[{ href: "/docs/supported-formats", label: "Supported formats" }]}
    />
  );
}
