import type { Metadata } from "next";
import { DocPage } from "@/components/DocPage";
import { supportedFormats } from "@/content/betaDocs";

export const metadata: Metadata = { title: "Supported formats — AEC Spec Validator" };

export default function FormatsPage() {
  return (
    <DocPage
      title="Supported formats"
      subtitle="Models, specifications, and exports accepted by the beta."
      sections={supportedFormats}
      related={[{ href: "/docs/validation-limitations", label: "Limitations" }]}
    />
  );
}
