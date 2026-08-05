"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  Braces,
  Building2,
  Check,
  Compass,
  FileCheck2,
  FileText,
  GitBranch,
  HardHat,
  Layers3,
  LockKeyhole,
  Menu,
  MessageSquareText,
  Ruler,
  ScanLine,
  ShieldCheck,
  Upload,
  Users,
  X
} from "lucide-react";

const capabilities = [
  [Ruler, "Structured requirements", "Clauses become checkable rules"],
  [LockKeyhole, "Immutable revisions", "Every saved revision stays frozen"],
  [GitBranch, "Traceable findings", "Finding → rule → source clause"],
  [Users, "Human review", "Named decisions with evidence"]
] as const;

const workflow = [
  [Upload, "Import specification", "Bring in requirements from JSON or CSV and retain their source reference."],
  [Braces, "Structure requirements", "Define rule type, condition, unit and tolerance with human confirmation."],
  [ScanLine, "Validate", "Check the design package against the active requirement revision."],
  [MessageSquareText, "Review findings", "Accept, waive or reject findings with a note and evidence."],
  [FileCheck2, "Export & trace", "Preserve the full chain from decision back to the original clause."]
] as const;

const examples = [
  {
    id: "F-01.4",
    label: "Fire resistance",
    clause: "Compartment walls shall achieve a fire resistance rating of EI 90.",
    rule: "wall.fireRatingMinutes >= 90",
    element: "Wall W-2.14 · Level 02",
    observed: "60 min",
    required: "90 min",
    status: "Open · Critical"
  },
  {
    id: "A-03.2",
    label: "Clear door width",
    clause: "Doors on accessible routes shall provide a minimum clear width of 900 mm.",
    rule: "door.clearWidthMm >= 900",
    element: "Door D-1.08 · Ground floor",
    observed: "850 mm",
    required: "900 mm",
    status: "In review · Major"
  },
  {
    id: "E-02.1",
    label: "Facade U-value",
    clause: "The external wall assembly shall not exceed a U-value of 0.24 W/m²K.",
    rule: "wall.uValue <= 0.24",
    element: "Facade type EXT-04",
    observed: "0.28 W/m²K",
    required: "≤ 0.24 W/m²K",
    status: "Open · Major"
  }
] as const;

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
            <a href="#workflow">Workflow</a><a href="#product">Product</a><a href="#use-cases">Use cases</a><a href="#governance">Governance</a>
          </nav>
          <div className="hidden items-center gap-3 md:flex">
            <Link href="/workspace" className="aec-button-secondary">Open demo</Link>
            <Link href="/workspace" className="aec-button-primary">Start a project <ArrowRight className="size-4" /></Link>
          </div>
          <button className="p-2 md:hidden" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle navigation">
            {menuOpen ? <X /> : <Menu />}
          </button>
        </div>
        {menuOpen && <nav className="border-t border-[var(--aec-line)] bg-[var(--aec-paper)] px-5 py-5 md:hidden">
          <div className="grid gap-4 text-sm"><a href="#workflow" onClick={() => setMenuOpen(false)}>Workflow</a><a href="#product" onClick={() => setMenuOpen(false)}>Product</a><a href="#use-cases" onClick={() => setMenuOpen(false)}>Use cases</a><Link href="/workspace" className="aec-button-primary mt-2 justify-center">Open workspace</Link></div>
        </nav>}
      </header>

      <main>
        <section className="blueprint-grid border-b border-[var(--aec-line)]">
          <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 lg:grid-cols-[1.02fr_.98fr] lg:items-center lg:px-8 lg:py-28">
            <div>
              <p className="tech-label text-[var(--aec-blue)]">Architecture · Construction engineering · Project delivery</p>
              <h1 className="mt-5 max-w-3xl text-4xl font-medium leading-[1.04] tracking-[-0.04em] sm:text-6xl">
                Every specification clause, checked against what you are actually delivering.
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-[var(--aec-muted)]">
                AEC turns written building requirements into structured rules. Validate BIM and project data, investigate findings with your team, and preserve a traceable record from every decision back to its source.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link href="/workspace" className="aec-button-primary">Start with your project <ArrowRight className="size-4" /></Link>
                <Link href="/workspace" className="aec-button-secondary">Explore the sample project</Link>
              </div>
              <p className="tech-label mt-5">Working product · Sample project uses demonstration data</p>
            </div>
            <HeroPanel />
          </div>
        </section>

        <section aria-label="Capabilities" className="border-b border-[var(--aec-line)] bg-[var(--aec-canvas)]">
          <div className="mx-auto grid max-w-7xl divide-y divide-[var(--aec-line)] sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
            {capabilities.map(([Icon, title, note]) => <div key={title} className="flex gap-3 px-6 py-6"><Icon className="mt-0.5 size-4 shrink-0 text-[var(--aec-copper)]" strokeWidth={1.6}/><div><p className="text-sm">{title}</p><p className="tech-label mt-1">{note}</p></div></div>)}
          </div>
        </section>

        <section id="workflow" className="scroll-mt-20 border-b border-[var(--aec-line)]">
          <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
            <SectionTitle eyebrow="Workflow" title="From specification to auditable decision" text="Five connected steps. Nothing is inferred silently: a person confirms the interpretation and every decision leaves a record." />
            <ol className="mt-12 grid gap-px bg-[var(--aec-line)] md:grid-cols-3 lg:grid-cols-5">
              {workflow.map(([Icon, title, text], i) => <li key={title} className="group bg-[var(--aec-card)] p-6 transition hover:bg-white"><div className="flex justify-between"><Icon className="size-4 text-[var(--aec-blue)]"/><span className="font-mono text-xs text-[var(--aec-faint)]">{String(i + 1).padStart(2,"0")}</span></div><h3 className="mt-5 text-sm font-medium">{title}</h3><p className="mt-2 text-xs leading-5 text-[var(--aec-muted)]">{text}</p></li>)}
            </ol>
          </div>
        </section>

        <section id="product" className="scroll-mt-20 border-b border-[var(--aec-line)] bg-[var(--aec-canvas)]">
          <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
            <SectionTitle eyebrow="Interactive traceability" title="Follow one requirement end to end" text="Select a construction requirement and inspect the source clause, structured rule, validation result and review state." />
            <div className="mt-12 overflow-hidden border border-[var(--aec-line-strong)] bg-[var(--aec-card)] shadow-[var(--aec-shadow)]">
              <div className="flex overflow-x-auto border-b border-[var(--aec-line)] bg-[var(--aec-canvas)]" role="tablist">
                {examples.map((item, index) => <button key={item.id} role="tab" aria-selected={active === index} onClick={() => setActive(index)} className={`min-w-44 flex-1 px-5 py-4 text-left transition ${active === index ? "bg-white shadow-[inset_0_-2px_var(--aec-blue)]" : "hover:bg-white"}`}><span className="tech-label block text-[var(--aec-blue)]">{item.id}</span><span className="mt-1 block text-sm">{item.label}</span></button>)}
              </div>
              <div className="grid divide-y divide-[var(--aec-line)] lg:grid-cols-4 lg:divide-x lg:divide-y-0">
                <TraceCell number="01" title="Source requirement" icon={FileText}><p>{example.clause}</p><p className="tech-label mt-4">Project specification · Section {example.id}</p></TraceCell>
                <TraceCell number="02" title="Structured rule" icon={Braces}><code className="block overflow-x-auto border border-[var(--aec-line)] bg-[var(--aec-canvas)] p-3 text-xs">{example.rule}</code><p className="tech-label mt-4">Revision 3 · Immutable</p></TraceCell>
                <TraceCell number="03" title="Validation result" icon={ScanLine}><p className="font-medium">{example.element}</p><div className="mt-4 grid grid-cols-2 gap-px bg-[var(--aec-line)]"><Metric label="Observed" value={example.observed} bad/><Metric label="Required" value={example.required}/></div></TraceCell>
                <TraceCell number="04" title="Review decision" icon={MessageSquareText}><span className="inline-flex border border-red-200 bg-red-50 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-red-700">{example.status}</span><p className="mt-4 text-[var(--aec-muted)]">Assigned reviewer records the decision, note and evidence before closure.</p></TraceCell>
              </div>
            </div>
          </div>
        </section>

        <section id="use-cases" className="scroll-mt-20 border-b border-[var(--aec-line)]">
          <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
            <SectionTitle eyebrow="Built for the project team" title="One requirement record everyone can rely on" text="Architecture, engineering, delivery and ownership work from the same revision and the same decision history." />
            <div className="mt-12 grid gap-px bg-[var(--aec-line)] sm:grid-cols-2 lg:grid-cols-4">
              {[[Compass,"Architecture practices","Keep written specifications and issued design packages aligned across project stages."],[Ruler,"Engineering consultancies","Own discipline-specific rule sets and return findings the design team can act on."],[HardHat,"Contractors","Check submittals and model data against contract requirements before coordination."],[Building2,"Project owners","See coverage, open findings and decision ownership without reading every revision."]].map(([Icon,title,text]) => { const C=Icon as typeof Compass; return <article key={title as string} className="bg-[var(--aec-card)] p-6"><C className="size-4 text-[var(--aec-copper)]"/><h3 className="mt-5 text-sm font-medium">{title as string}</h3><p className="mt-2 text-xs leading-5 text-[var(--aec-muted)]">{text as string}</p></article>;})}
            </div>
          </div>
        </section>

        <section id="governance" className="scroll-mt-20 border-b border-[var(--aec-line)] bg-[var(--aec-canvas)]">
          <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
            <SectionTitle eyebrow="Governance" title="Designed so every decision can be explained later" text="Project-scoped access, immutable requirement revisions and named reviews preserve the context behind a result." />
            <div className="mt-12 grid gap-px bg-[var(--aec-line)] md:grid-cols-3">
              {[[Layers3,"Project-based access","Work is scoped to its project, packages and invited team members."],[LockKeyhole,"Immutable revisions","Saved revisions cannot be overwritten; changes create a comparable successor."],[ShieldCheck,"Human decision trail","Reviews retain the person, date, rationale and supporting evidence."]].map(([Icon,title,text]) => { const C=Icon as typeof Layers3; return <article key={title as string} className="bg-[var(--aec-card)] p-7"><C className="size-5 text-[var(--aec-blue)]"/><h3 className="mt-5 font-medium">{title as string}</h3><p className="mt-3 text-sm leading-6 text-[var(--aec-muted)]">{text as string}</p></article>;})}
            </div>
          </div>
        </section>

        <section className="blueprint-grid">
          <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8"><div className="border border-[var(--aec-line-strong)] bg-[var(--aec-card)] p-8 md:p-12"><p className="tech-label text-[var(--aec-blue)]">Start now</p><h2 className="mt-4 max-w-3xl text-3xl font-medium tracking-tight">Bring your specification and model into one traceable validation workspace.</h2><p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--aec-muted)]">The working application supports IFC and JSON model imports, plus JSON and CSV requirement packages.</p><div className="mt-8 flex flex-wrap gap-3"><Link href="/workspace" className="aec-button-primary">Open workspace <ArrowRight className="size-4"/></Link><Link href="/workspace" className="aec-button-secondary">Use sample data</Link></div></div></div>
        </section>
      </main>

      <footer className="border-t border-[var(--aec-line)] bg-[var(--aec-ink)] text-white"><div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-8 sm:flex-row sm:items-center sm:justify-between lg:px-8"><div><p className="text-sm font-medium">AEC Spec Validator</p><p className="mt-1 text-xs text-slate-400">Specification validation for architecture and construction.</p></div><div className="flex gap-5 text-xs text-slate-300"><a href="#workflow">Workflow</a><a href="#governance">Governance</a><Link href="/workspace">Workspace</Link></div></div></footer>
    </div>
  );
}

function HeroPanel() {
  return <div className="relative border border-[var(--aec-line-strong)] bg-[var(--aec-card)] p-3 shadow-[var(--aec-shadow)]"><div className="flex items-center justify-between border-b border-[var(--aec-line)] px-3 pb-3"><div><p className="tech-label">Active package</p><p className="mt-1 text-sm font-medium">Architectural requirements</p></div><span className="border border-emerald-200 bg-emerald-50 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-emerald-700">Run complete</span></div><div className="grid grid-cols-3 gap-px bg-[var(--aec-line)] my-3"><Metric label="Requirements" value="24"/><Metric label="Covered" value="92%"/><Metric label="Open findings" value="6" bad/></div><div className="space-y-px bg-[var(--aec-line)]">{[["F-01.4","Fire compartment wall","Failed"],["A-03.2","Accessible door width","Review"],["E-02.1","Facade U-value","Failed"],["S-04.3","Escape route length","Passed"]].map(([id,title,status]) => <div key={id} className="grid grid-cols-[70px_1fr_auto] items-center gap-3 bg-white px-3 py-3 text-xs"><code className="text-[var(--aec-blue)]">{id}</code><span>{title}</span><span className={status === "Passed" ? "text-emerald-700" : status === "Review" ? "text-amber-700" : "text-red-700"}>{status}</span></div>)}</div><div className="mt-3 flex items-center gap-2 border-l-2 border-[var(--aec-copper)] bg-[var(--aec-copper-soft)] px-3 py-3 text-xs"><Check className="size-4 text-[var(--aec-copper)]"/> Every result remains linked to its source clause.</div></div>;
}

function SectionTitle({eyebrow,title,text}:{eyebrow:string;title:string;text:string}) { return <div className="max-w-3xl"><p className="tech-label text-[var(--aec-blue)]">{eyebrow}</p><h2 className="mt-4 text-3xl font-medium tracking-[-0.025em] sm:text-4xl">{title}</h2><p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--aec-muted)]">{text}</p></div>; }
function TraceCell({number,title,icon:Icon,children}:{number:string;title:string;icon:typeof FileText;children:React.ReactNode}) { return <div className="min-w-0 p-5"><div className="flex items-center gap-2"><Icon className="size-4 text-[var(--aec-blue)]"/><p className="tech-label text-[var(--aec-ink)]">{number} · {title}</p></div><div className="mt-4 text-xs leading-5">{children}</div></div>; }
function Metric({label,value,bad=false}:{label:string;value:string;bad?:boolean}) { return <div className="bg-white p-3"><p className="tech-label">{label}</p><p className={`mt-1 font-mono text-sm ${bad ? "text-red-700" : "text-[var(--aec-ink)]"}`}>{value}</p></div>; }
