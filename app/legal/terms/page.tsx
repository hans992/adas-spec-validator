import type { Metadata } from "next";
import { DocPage } from "@/components/DocPage";
import { termsOfService } from "@/content/betaDocs";

export const metadata: Metadata = { title: "Terms of service — AEC Spec Validator" };

export default function TermsPage() {
  return (
    <DocPage
      title="Terms of service"
      subtitle="Beta terms for using AEC Spec Validator."
      sections={termsOfService}
      related={[
        { href: "/legal/privacy", label: "Privacy" },
        { href: "/docs", label: "Documentation" }
      ]}
    />
  );
}
