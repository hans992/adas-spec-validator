import type { Metadata } from "next";
import { DocPage } from "@/components/DocPage";
import { dataRetentionDoc } from "@/content/betaDocs";

export const metadata: Metadata = { title: "Data retention — AEC Spec Validator" };

export default function RetentionPage() {
  return (
    <DocPage
      title="Data retention"
      subtitle="Soft delete, purge windows, and what artefacts remain on disk."
      sections={dataRetentionDoc}
      related={[
        { href: "/legal/privacy", label: "Privacy" },
        { href: "/security", label: "Security overview" }
      ]}
    />
  );
}
