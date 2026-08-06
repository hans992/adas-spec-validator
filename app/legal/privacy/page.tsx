import type { Metadata } from "next";
import { DocPage } from "@/components/DocPage";
import { privacyPolicy } from "@/content/betaDocs";

export const metadata: Metadata = { title: "Privacy policy — AEC Spec Validator" };

export default function PrivacyPage() {
  return (
    <DocPage
      title="Privacy policy"
      subtitle="How AEC Spec Validator processes account and project data during the beta."
      sections={privacyPolicy}
      related={[
        { href: "/docs/subprocessors", label: "Subprocessors" },
        { href: "/docs/data-retention", label: "Data retention" },
        { href: "/legal/terms", label: "Terms" }
      ]}
    />
  );
}
