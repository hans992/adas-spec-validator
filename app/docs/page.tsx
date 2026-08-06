import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Documentation — AEC Spec Validator",
  description: "User guides, legal policies, security, formats, and API/CLI documentation for the beta release."
};

const links = [
  { href: "/docs/user-guide", title: "User guide", note: "First project checklist and workspace flow" },
  { href: "/docs/api-cli", title: "API & CLI", note: "Machine API tokens, v1 routes, CI samples" },
  { href: "/docs/supported-formats", title: "Supported formats", note: "IFC, JSON, XLSX, DOCX, PDF, exports" },
  { href: "/docs/validation-limitations", title: "Validation limitations", note: "Engine scope and non-claims" },
  { href: "/docs/ai-transparency", title: "AI transparency", note: "What AI explains vs deterministic truth" },
  { href: "/docs/data-retention", title: "Data retention", note: "Soft delete, purge, and stored artefacts" },
  { href: "/docs/subprocessors", title: "Subprocessors", note: "EU-oriented processor list" },
  { href: "/legal/privacy", title: "Privacy policy", note: "Personal data, rights, incident contact" },
  { href: "/legal/terms", title: "Terms of service", note: "Beta terms, acceptable use, liability" },
  { href: "/security", title: "Security overview", note: "SECURITY.md rendered for operators" }
];

export default function DocsIndex() {
  return (
    <div className="marketing min-h-screen bg-[var(--aec-paper)] text-[var(--aec-ink)]">
      <header className="border-b border-[var(--aec-line)]">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-5">
          <Link href="/" className="text-sm font-medium">AEC Spec Validator</Link>
          <Link href="/workspace" className="text-xs">Workspace</Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-12">
        <p className="tech-label text-[var(--aec-blue)]">Beta documentation</p>
        <h1 className="mt-3 text-3xl font-medium tracking-tight">Documentation</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--aec-muted)]">
          Policies, user guidance, and operator references for the beta release. Incident contact: security@example.com (replace before production).
        </p>
        <ul className="mt-10 divide-y divide-[var(--aec-line)] border border-[var(--aec-line)]">
          {links.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="flex flex-col gap-1 px-4 py-4 hover:bg-white sm:flex-row sm:items-baseline sm:justify-between">
                <span className="text-sm font-medium">{item.title}</span>
                <span className="text-xs text-[var(--aec-muted)]">{item.note}</span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
