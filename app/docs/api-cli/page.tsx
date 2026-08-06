import type { Metadata } from "next";
import { DocPage } from "@/components/DocPage";
import { apiCliGuide } from "@/content/betaDocs";

export const metadata: Metadata = { title: "API & CLI — AEC Spec Validator" };

export default function ApiCliPage() {
  return (
    <DocPage
      title="API and CLI documentation"
      subtitle="Machine access for CI pipelines and automation."
      sections={apiCliGuide}
      related={[
        { href: "/docs/user-guide", label: "User guide" },
        { href: "/security", label: "Security overview" }
      ]}
    />
  );
}
