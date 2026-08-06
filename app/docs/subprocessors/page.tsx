import type { Metadata } from "next";
import { DocPage } from "@/components/DocPage";
import { subprocessorsDoc } from "@/content/betaDocs";

export const metadata: Metadata = { title: "Subprocessors — AEC Spec Validator" };

export default function SubprocessorsPage() {
  return (
    <DocPage
      title="Subprocessors"
      subtitle="Third parties that may process data for a production deployment."
      sections={subprocessorsDoc}
      related={[
        { href: "/legal/privacy", label: "Privacy" },
        { href: "/security", label: "Security overview" }
      ]}
    />
  );
}
