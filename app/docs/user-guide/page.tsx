import type { Metadata } from "next";
import { DocPage } from "@/components/DocPage";
import { userGuide } from "@/content/betaDocs";

export const metadata: Metadata = { title: "User guide — AEC Spec Validator" };

export default function UserGuidePage() {
  return (
    <DocPage
      title="User guide"
      subtitle="How to complete the first validation workflow in the workspace."
      sections={userGuide}
      related={[
        { href: "/workspace", label: "Open workspace" },
        { href: "/docs/api-cli", label: "API & CLI" }
      ]}
    />
  );
}
