import type { Metadata } from "next";
import Link from "next/link";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const metadata: Metadata = {
  title: "Security overview — AEC Spec Validator",
  description: "Authentication, RLS, upload hardening, retention, subprocessors, and incident contact."
};

export default function SecurityOverviewPage() {
  const markdown = readFileSync(join(process.cwd(), "SECURITY.md"), "utf8");
  // Render as preformatted markdown text for an accurate operator view without an MDX pipeline.
  return (
    <div className="marketing min-h-screen bg-[var(--aec-paper)] text-[var(--aec-ink)]">
      <header className="border-b border-[var(--aec-line)]">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-5">
          <Link href="/" className="text-sm font-medium">AEC Spec Validator</Link>
          <div className="flex gap-4 text-xs">
            <Link href="/docs">Docs</Link>
            <Link href="/legal/privacy">Privacy</Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-12">
        <p className="tech-label text-[var(--aec-blue)]">Security</p>
        <h1 className="mt-3 text-3xl font-medium tracking-tight">Security overview</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--aec-muted)]">
          Source of truth: <code className="font-mono text-xs">SECURITY.md</code> in the repository.
          Incident contact: <strong>security@example.com</strong> (replace before production).
        </p>
        <pre className="mt-8 overflow-x-auto whitespace-pre-wrap rounded border border-[var(--aec-line)] bg-white p-4 text-xs leading-5 text-[var(--aec-ink)]">
          {markdown}
        </pre>
      </main>
    </div>
  );
}
