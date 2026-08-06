"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  Braces,
  Check,
  FileCheck2,
  FileText,
  GitBranch,
  Menu,
  MessageSquareText,
  ScanLine,
  ShieldCheck,
  Upload,
  X
} from "lucide-react";

import { PLANS, formatBytes, type PlanId } from "@/billing/planLimits";

const workflow = [
  [Upload, "Import documentation", "Bring in IFC or model JSON plus a specification from JSON, CSV, or a reviewed XLSX, DOCX or PDF package."],
  [Braces, "Deterministic validation", "The server re-runs structured rules against the model. Results are never accepted from the client."],
  [GitBranch, "Source traceability", "Every finding links back to a requirement, clause and — when available — document provenance."],
  [MessageSquareText, "Human review", "Acknowledge, resolve or waive findings with a named reviewer, reason and optional waiver expiry."],
  [FileCheck2, "Regression & audit export", "Compare against a baseline release policy, then download a checksummed audit ZIP."]
] as const;

const examples = [
  {
    id: "req-stockroom-min-area",
    label: "Stockroom area",
    clause: "Stockrooms must be at least 15 m² (Spec §3.2.1).",
    rule: "room.roomType == stockroom && room.areaSqm >= 15",
    element: "Stockroom B · 11.2 m²",
    observed: "11.2 m²",
    required: "≥ 15 m²",
    status: "Fail · Critical"
  },
  {
    id: "req-stockroom-door-width",
    label: "Door clear width",
    clause: "Stockroom doors must be at least 0.85 m clear width (Spec §4.1.2).",
    rule: "door.widthM >= 0.85 for stockroom rooms",
    element: "Door S-A Egress · 0.78 m",
    observed: "0.78 m",
    required: "≥ 0.85 m",
    status: "Waived · Warning"
  },
  {
    id: "req-fire-rating-unknown",
    label: "Fire resistance",
    clause: "Compartment walls shall achieve EI 90 (Spec §6.2.3).",
    rule: "textual — awaiting rule configuration",
    element: "Model-wide",
    observed: "Not evaluated",
    required: "EI 90",
    status: "Unknown · Critical"
  }
] as const;

const planOrder: PlanId[] = ["starter", "professional", "enterprise"];

export function MarketingLanding() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [active, setActive] = useState(0);
  const example = examples[active];

  return (
    <div className="marketing min-h-screen bg-[var(--aec-paper)] text-[var(--aec-ink)]">
      <header className="sticky top-0 z-50 border-b border-[var(--aec-line)] bg-[color:var(--aec-paper)/0.94] backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 lg:px-8">
          <Link href="/" className="flex items-center gap-3" aria-label="AEC home">
            <span className="grid size-8 place-items-center border border-[var(--aec-ink)] font-mono text-[9px] font-semibold tracking-tight">AEC</span>
            <span>
              <strong className="block text-sm leading-none tracking-tight">AEC</strong>
              <span className="tech-label mt-1 block">Spec validator</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm md:flex" aria-label="Primary navigation">
            <a href="#workflow">Workflow</a>
            <a href="#product">Product</a>
            <a href="#pricing">Pricing</a>
          </nav>
          <div className="hidden items-center gap-3 md:flex">
            <Link href="/workspace" className="aec-button-secondary">Open workspace</Link>
            <Link href="/workspace" className="aec-button-primary">Start a project <ArrowRight className="size-4" /></Link>
          </div>
          <button className="p-2 md:hidden" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle navigation">
            {menuOpen ? <X /> : <Menu />}
          </button>
        </div>
        {menuOpen && <nav className="border-t border-[var(--aec-line)] bg-[var(--aec-paper)] px-5 py-5 md:hidden">
          <div className="grid gap-4 text-sm">
            <a href="#workflow" onClick={() => setMenuOpen(false)}>Workflow</a>
            <a href="#pricing" onClick={() => setMenuOpen(false)}>Pricing</a>
            <Link href="/workspace" className="aec-button-primary mt-2 justify-center">Open workspace</Link>
          </div>
        </nav>}
      </header>

      <main>
        <section className="blueprint-grid border-b border-[var(--aec-line)]">
          <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 lg:grid-cols-[1.02fr_.98fr] lg:items-center lg:px-8 lg:py-28">
            <div>
              <p className="tech-label text-[var(--aec-blue)]">Architecture · Construction engineering · Project delivery</p>
              <h1 className="mt-5 max-w-3xl text-4xl font-medium leading-[1.04] tracking-[-0.04em] sm:text-6xl">
                Specification clauses, checked against the model you are delivering.
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-[var(--aec-muted)]">
                Import project documentation, run deterministic validation, review findings with your team, control regressions against a baseline, and export a checksummed audit package.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link href="/workspace" className="aec-button-primary">Open the workspace <ArrowRight className="size-4" /></Link>
                <Link href="/workspace" className="aec-button-secondary">Sign in and load the demo project</Link>
              </div>
              <p className="tech-label mt-5">Working product · Demo includes passes, failures, an unknown finding, a waiver and two revisions</p>
            </div>
            <HeroPanel />
          </div>
        </section>

        <section id="workflow" className="scroll-mt-20 border-b border-[var(--aec-line)]">
          <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
            <SectionTitle
              eyebrow="Workflow"
              title="What the product actually does"
              text="These steps are live in the workspace today — not a roadmap. Nothing here promises digital signatures, SSO or features that are not shipped."
            />
            <ol className="mt-12 grid gap-px bg-[var(--aec-line)] md:grid-cols-3 lg:grid-cols-5">
              {workflow.map(([Icon, title, text], i) => (
                <li key={title} className="group bg-[var(--aec-card)] p-6 transition hover:bg-white">
                  <div className="flex justify-between">
                    <Icon className="size-4 text-[var(--aec-blue)]" />
                    <span className="font-mono text-xs text-[var(--aec-faint)]">{String(i + 1).padStart(2, "0")}</span>
                  </div>
                  <h3 className="mt-5 text-sm font-medium">{title}</h3>
                  <p className="mt-2 text-xs leading-5 text-[var(--aec-muted)]">{text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="product" className="scroll-mt-20 border-b border-[var(--aec-line)] bg-[var(--aec-canvas)]">
          <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
            <SectionTitle
              eyebrow="Demo findings"
              title="Follow a real requirement from the Riverside Office demo"
              text="The guided demo project seeds the same outcomes: passing rules, concrete failures, one unknown textual clause, and a waived door-width finding."
            />
            <div className="mt-12 overflow-hidden border border-[var(--aec-line-strong)] bg-[var(--aec-card)] shadow-[var(--aec-shadow)]">
              <div className="flex overflow-x-auto border-b border-[var(--aec-line)] bg-[var(--aec-canvas)]" role="tablist">
                {examples.map((item, index) => (
                  <button
                    key={item.id}
                    role="tab"
                    aria-selected={active === index}
                    onClick={() => setActive(index)}
                    className={`min-w-44 flex-1 px-5 py-4 text-left transition ${active === index ? "bg-white shadow-[inset_0_-2px_var(--aec-blue)]" : "hover:bg-white"}`}
                  >
                    <span className="tech-label block text-[var(--aec-blue)]">{item.id}</span>
                    <span className="mt-1 block text-sm">{item.label}</span>
                  </button>
                ))}
              </div>
              <div className="grid divide-y divide-[var(--aec-line)] lg:grid-cols-4 lg:divide-x lg:divide-y-0">
                <TraceCell number="01" title="Source requirement" icon={FileText}>
                  <p>{example.clause}</p>
                  <p className="tech-label mt-4">Riverside Office · Revision A</p>
                </TraceCell>
                <TraceCell number="02" title="Structured rule" icon={Braces}>
                  <code className="block overflow-x-auto border border-[var(--aec-line)] bg-[var(--aec-canvas)] p-3 text-xs">{example.rule}</code>
                </TraceCell>
                <TraceCell number="03" title="Validation result" icon={ScanLine}>
                  <p className="font-medium">{example.element}</p>
                  <div className="mt-4 grid grid-cols-2 gap-px bg-[var(--aec-line)]">
                    <Metric label="Observed" value={example.observed} bad />
                    <Metric label="Required" value={example.required} />
                  </div>
                </TraceCell>
                <TraceCell number="04" title="Review decision" icon={MessageSquareText}>
                  <span className="inline-flex border border-red-200 bg-red-50 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-red-700">{example.status}</span>
                  <p className="mt-4 text-[var(--aec-muted)]">Reviewers record status, comment, waiver reason and expiry before the audit export.</p>
                </TraceCell>
              </div>
            </div>
          </div>
        </section>

        <section id="pricing" className="scroll-mt-20 border-b border-[var(--aec-line)]">
          <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
            <SectionTitle
              eyebrow="Pricing"
              title="Limits that the API actually enforces"
              text="Caps on projects, members, monthly validation runs, storage, file size, audit exports, API/CI access and retention are checked on every mutating request — not only shown here."
            />
            <div className="mt-12 grid gap-px bg-[var(--aec-line)] lg:grid-cols-3">
              {planOrder.map((id) => {
                const plan = PLANS[id];
                const featured = id === "professional";
                return (
                  <article key={id} className={`bg-[var(--aec-card)] p-7 ${featured ? "ring-1 ring-[var(--aec-blue)]" : ""}`}>
                    <p className="tech-label text-[var(--aec-blue)]">{plan.name}</p>
                    <p className="mt-3 text-3xl font-medium tracking-tight">
                      {id === "enterprise" ? "Custom" : plan.priceMonthlyEur === 0 ? "Free" : `€${plan.priceMonthlyEur}`}
                      {id !== "enterprise" && plan.priceMonthlyEur > 0 && <span className="text-sm font-normal text-[var(--aec-muted)]"> / month</span>}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-[var(--aec-muted)]">{plan.tagline}</p>
                    <ul className="mt-6 space-y-2 text-xs">
                      {plan.highlights.map((item) => (
                        <li key={item} className="flex gap-2">
                          <Check className="mt-0.5 size-3.5 shrink-0 text-[var(--aec-copper)]" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                    <dl className="mt-6 grid grid-cols-2 gap-2 border-t border-[var(--aec-line)] pt-4 text-[10px] text-[var(--aec-muted)]">
                      <div><dt>Max file</dt><dd className="font-mono text-[var(--aec-ink)]">{formatBytes(plan.maxFileBytes)}</dd></div>
                      <div><dt>Retention</dt><dd className="font-mono text-[var(--aec-ink)]">{plan.retentionDays}d</dd></div>
                      <div><dt>API / CI</dt><dd className="font-mono text-[var(--aec-ink)]">{plan.apiAccess ? "Yes" : "No"}</dd></div>
                      <div><dt>Audit exports</dt><dd className="font-mono text-[var(--aec-ink)]">{plan.monthlyAuditExports}/mo</dd></div>
                    </dl>
                    <Link href="/workspace" className={`mt-6 inline-flex w-full justify-center ${featured ? "aec-button-primary" : "aec-button-secondary"}`}>
                      {id === "starter" ? "Start free" : id === "enterprise" ? "Talk to us in workspace" : "Use Professional limits"}
                    </Link>
                  </article>
                );
              })}
            </div>
            <p className="mt-6 text-xs text-[var(--aec-muted)]">
              New accounts start on Starter. Operators assign Professional or Enterprise in <code className="font-mono">account_plans</code>. Set <code className="font-mono">FORCE_ACCOUNT_PLAN</code> in development to exercise higher tiers.
            </p>
          </div>
        </section>

        <section className="blueprint-grid">
          <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
            <div className="border border-[var(--aec-line-strong)] bg-[var(--aec-card)] p-8 md:p-12">
              <p className="tech-label text-[var(--aec-blue)]">First project</p>
              <h2 className="mt-4 max-w-3xl text-3xl font-medium tracking-tight">Sign in, load the demo, then replace it with your package.</h2>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--aec-muted)]">
                The workspace checklist walks through project → model → specification → validation → findings → review → audit export. Empty and error states name the expected format and the next step.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/workspace" className="aec-button-primary">Open workspace <ArrowRight className="size-4" /></Link>
                <a href="#pricing" className="aec-button-secondary">Compare plans</a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--aec-line)] bg-[var(--aec-ink)] text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-8 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <div>
            <p className="text-sm font-medium">AEC Spec Validator</p>
            <p className="mt-1 text-xs text-slate-400">Import · validate · review · regress · export.</p>
          </div>
          <div className="flex gap-5 text-xs text-slate-300">
            <a href="#workflow">Workflow</a>
            <a href="#pricing">Pricing</a>
            <Link href="/workspace">Workspace</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function HeroPanel() {
  return (
    <div className="relative border border-[var(--aec-line-strong)] bg-[var(--aec-card)] p-3 shadow-[var(--aec-shadow)]">
      <div className="flex items-center justify-between border-b border-[var(--aec-line)] px-3 pb-3">
        <div>
          <p className="tech-label">Demo project</p>
          <p className="mt-1 text-sm font-medium">Riverside Office</p>
        </div>
        <span className="border border-emerald-200 bg-emerald-50 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-emerald-700">Baseline set</span>
      </div>
      <div className="my-3 grid grid-cols-3 gap-px bg-[var(--aec-line)]">
        <Metric label="Requirements" value="6" />
        <Metric label="Pass / fail" value="mix" />
        <Metric label="Unknown" value="1" bad />
      </div>
      <div className="space-y-px bg-[var(--aec-line)]">
        {[
          ["req-office-min-area", "Office min area", "Fail"],
          ["req-stockroom-door-width", "Stockroom door width", "Waived"],
          ["req-fire-rating-unknown", "EI 90 compartment walls", "Unknown"],
          ["req-room-has-door", "Room has connected door", "Fail"]
        ].map(([id, title, status]) => (
          <div key={id} className="grid grid-cols-[minmax(0,1.2fr)_1fr_auto] items-center gap-3 bg-white px-3 py-3 text-xs">
            <code className="truncate text-[var(--aec-blue)]">{id}</code>
            <span className="truncate">{title}</span>
            <span className={status === "Waived" ? "text-amber-700" : status === "Unknown" ? "text-slate-600" : "text-red-700"}>{status}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 border-l-2 border-[var(--aec-copper)] bg-[var(--aec-copper-soft)] px-3 py-3 text-xs">
        <ShieldCheck className="size-4 text-[var(--aec-copper)]" /> Two revisions seed regression; audit ZIP uses SHA-256 checksums — not a digital signature.
      </div>
    </div>
  );
}

function SectionTitle({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return (
    <div className="max-w-3xl">
      <p className="tech-label text-[var(--aec-blue)]">{eyebrow}</p>
      <h2 className="mt-4 text-3xl font-medium tracking-[-0.025em] sm:text-4xl">{title}</h2>
      <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--aec-muted)]">{text}</p>
    </div>
  );
}

function TraceCell({ number, title, icon: Icon, children }: { number: string; title: string; icon: typeof FileText; children: React.ReactNode }) {
  return (
    <div className="min-w-0 p-5">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-[var(--aec-blue)]" />
        <p className="tech-label text-[var(--aec-ink)]">{number} · {title}</p>
      </div>
      <div className="mt-4 text-xs leading-5">{children}</div>
    </div>
  );
}

function Metric({ label, value, bad = false }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className="bg-white p-3">
      <p className="tech-label">{label}</p>
      <p className={`mt-1 font-mono text-sm ${bad ? "text-red-700" : "text-[var(--aec-ink)]"}`}>{value}</p>
    </div>
  );
}
