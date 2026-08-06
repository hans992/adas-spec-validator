import Link from "next/link";
import type { DocSection } from "@/content/betaDocs";

export function DocPage({
  title,
  subtitle,
  sections,
  related
}: {
  title: string;
  subtitle: string;
  sections: DocSection[];
  related?: Array<{ href: string; label: string }>;
}) {
  return (
    <div className="marketing min-h-screen bg-[var(--aec-paper)] text-[var(--aec-ink)]">
      <header className="border-b border-[var(--aec-line)]">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-5">
          <Link href="/" className="text-sm font-medium tracking-tight">AEC Spec Validator</Link>
          <div className="flex gap-4 text-xs">
            <Link href="/docs">Docs</Link>
            <Link href="/workspace">Workspace</Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-12">
        <p className="tech-label text-[var(--aec-blue)]">Beta documentation</p>
        <h1 className="mt-3 text-3xl font-medium tracking-tight">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--aec-muted)]">{subtitle}</p>
        <div className="mt-10 space-y-8">
          {sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-lg font-medium">{section.heading}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph.slice(0, 48)} className="mt-2 text-sm leading-6 text-[var(--aec-muted)]">{paragraph}</p>
              ))}
              {section.bullets && (
                <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-6 text-[var(--aec-muted)]">
                  {section.bullets.map((item) => <li key={item}>{item}</li>)}
                </ul>
              )}
            </section>
          ))}
        </div>
        {related && related.length > 0 && (
          <nav className="mt-12 border-t border-[var(--aec-line)] pt-6 text-sm">
            <p className="tech-label">Related</p>
            <ul className="mt-3 flex flex-wrap gap-4">
              {related.map((item) => (
                <li key={item.href}><Link href={item.href} className="underline">{item.label}</Link></li>
              ))}
            </ul>
          </nav>
        )}
      </main>
    </div>
  );
}
