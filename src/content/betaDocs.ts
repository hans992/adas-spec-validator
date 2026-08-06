/**
 * Shared legal / product documentation copy for beta release pages.
 * Content mirrors SECURITY.md and README where those are the source of truth.
 */

export type DocSection = { heading: string; paragraphs: string[]; bullets?: string[] };

export const privacyPolicy: DocSection[] = [
  {
    heading: "Who we are",
    paragraphs: [
      "AEC Spec Validator (“AEC”) processes account and project data so architecture and construction teams can validate specifications against BIM models. The data controller is the organisation that operates your deployment."
    ]
  },
  {
    heading: "Data we process",
    paragraphs: ["Depending on how you use the product we process:"],
    bullets: [
      "Account data: email address, authentication identifiers, plan assignment.",
      "Project data: project names, members, specification packages, normalised models, validation results, reviews, evidence metadata, audit events.",
      "Technical data: request IDs, rate-limit keys (hashed), structured logs with automatic redaction of secrets and document content."
    ]
  },
  {
    heading: "Purposes and legal bases",
    paragraphs: [
      "We process data to provide the service (contract), secure the service (legitimate interest / legal obligation), and improve reliability (legitimate interest). Optional AI explanations send only server-verified findings to the configured provider — never raw project documents."
    ]
  },
  {
    heading: "Retention",
    paragraphs: [
      "Soft-deleted projects are hidden immediately and purged after the plan retention window (Starter 30 days, Professional 365 days, Enterprise as contracted). Account export is available to the signed-in owner. You may request permanent deletion of owned projects."
    ]
  },
  {
    heading: "Your rights",
    paragraphs: [
      "Depending on applicable law you may request access, correction, export, restriction, or deletion of personal data. Use Export account data in the workspace or contact the incident address below."
    ]
  },
  {
    heading: "Subprocessors",
    paragraphs: ["Current subprocessors are listed on the Security overview and Subprocessors page. We will update that list when processors change."]
  },
  {
    heading: "Incident contact",
    paragraphs: [
      "Security or privacy incidents: security@example.com (replace with your operational address before production). Include a request ID from the UI or logs when available."
    ]
  }
];

export const termsOfService: DocSection[] = [
  {
    heading: "Beta software",
    paragraphs: [
      "This release is a beta product. Features, limits, and availability may change. The service is provided “as is” during beta without warranties of uninterrupted operation."
    ]
  },
  {
    heading: "Accounts and acceptable use",
    paragraphs: [
      "You must provide accurate registration details, keep credentials confidential, and not attempt to bypass rate limits, upload malware, scrape other customers’ data, or overload the service. Project documents you upload must be material you are authorised to process."
    ]
  },
  {
    heading: "Plans and limits",
    paragraphs: [
      "Plan caps (projects, members, monthly validation runs, storage, file size, audit exports, API/CI access, retention) are enforced by the API. Exceeding a cap returns HTTP 402 with a concrete message."
    ]
  },
  {
    heading: "Intellectual property",
    paragraphs: [
      "You retain rights to your project content. AEC retains rights to the software, documentation, and deterministic rule engine. Feedback may be used to improve the product without obligation."
    ]
  },
  {
    heading: "Liability",
    paragraphs: [
      "Validation results are decision-support artefacts. They do not replace professional engineering judgement or statutory compliance. To the maximum extent permitted by law, liability during beta is limited to fees paid for the service in the preceding three months (zero for the free Starter plan)."
    ]
  },
  {
    heading: "Contact",
    paragraphs: ["Questions about these terms: legal@example.com (replace before production)."]
  }
];

export const aiTransparency: DocSection[] = [
  {
    heading: "What AI does — and does not do",
    paragraphs: [
      "Deterministic validation is the source of truth. The rule engine evaluates structured requirements against the normalised model on the server. AI chat, when configured, only explains already-computed findings."
    ],
    bullets: [
      "AI never authors validation results that are stored as evidence.",
      "AI never receives raw IFC, DOCX, XLSX, or PDF bytes.",
      "Without provider keys the product uses a deterministic fallback explanation path."
    ]
  },
  {
    heading: "Providers",
    paragraphs: [
      "Optional providers (Gemini via Google, OpenAI) are selected by environment configuration. Provider priority and verification steps are documented in the README. Outputs are checked against the trusted validation context before display."
    ]
  },
  {
    heading: "Human review",
    paragraphs: [
      "Review decisions (open, acknowledged, resolved, waived) are always human-authored, with optional waiver reason and expiry. AI suggestions do not auto-waive findings."
    ]
  }
];

export const supportedFormats: DocSection[] = [
  {
    heading: "Models",
    paragraphs: ["Accepted model inputs:"],
    bullets: [
      "IFC (.ifc) — IFC2X3 / IFC4 extracts for storeys, spaces, doors, quantities; 20 MB hard cap (plan may lower).",
      "Normalised model JSON — levels / rooms / doors schema used by the deterministic engine; 5 MB hard cap."
    ]
  },
  {
    heading: "Specifications",
    paragraphs: ["Accepted specification inputs:"],
    bullets: [
      "JSON / CSV packages matching the requirement schema.",
      "XLSX — reviewed import wizard with sheet/header mapping (10 MB).",
      "DOCX — reviewed OOXML import with provenance (15 MB).",
      "Text-based PDF — page-anchored extraction with scanned-page warnings (20 MB)."
    ]
  },
  {
    heading: "Exports",
    paragraphs: ["Markdown compliance report, traceability CSV/XLSX, and checksummed audit ZIP (immutable snapshot — not a digital signature)."]
  }
];

export const validationLimitations: DocSection[] = [
  {
    heading: "Engine scope",
    paragraphs: [
      "The deterministic engine evaluates structured rule types (room area, door width, room–door connectivity, composite room rules). Textual requirements that still need rule configuration produce unknown outcomes until mapped."
    ]
  },
  {
    heading: "Model fidelity",
    paragraphs: [
      "IFC parsing extracts a normalised subset. Geometry-heavy or proprietary property sets may be incomplete. Always inspect IFC diagnostics after import."
    ]
  },
  {
    heading: "Not claimed",
    paragraphs: ["The product does not claim:"],
    bullets: [
      "Full building-code automation or jurisdictional compliance certificates.",
      "Digitally signed reports (audit ZIP uses SHA-256 manifests only).",
      "Automatic interpretation of every free-text specification clause."
    ]
  }
];

export const dataRetentionDoc: DocSection[] = [
  {
    heading: "Retention windows",
    paragraphs: [
      "Soft-deleted projects are inaccessible to members immediately. Owners may restore until the retention window ends; afterwards purge_soft_deleted_projects removes them permanently. Plan defaults: Starter 30 days, Professional 365 days, Enterprise contractual."
    ]
  },
  {
    heading: "What is stored",
    paragraphs: [
      "Original DOCX/XLSX/PDF binaries are not retained after browser-side review — only approved provenance snapshots. Models persist as normalised JSON plus content hashes. Job upload payloads are cleared after parsing and by the janitor for terminal jobs."
    ]
  }
];

export const subprocessorsDoc: DocSection[] = [
  {
    heading: "Current subprocessors",
    paragraphs: ["Publish and keep this list current for customers:"],
    bullets: [
      "Supabase — database, auth, RLS (EU region).",
      "Vercel — hosting and serverless compute (pin fra1 for EU).",
      "Upstash — shared rate-limit counters (hashed keys, short TTL, EU).",
      "Google / OpenAI (optional) — AI explanations of verified findings only."
    ]
  }
];

export const userGuide: DocSection[] = [
  {
    heading: "First project checklist",
    paragraphs: ["In the workspace after sign-in:"],
    bullets: [
      "Create a project or Load demo project.",
      "Upload a model (IFC/JSON) and a specification (JSON/CSV/XLSX/DOCX/PDF).",
      "Confirm mapping in the import wizard.",
      "Save a specification revision, then Save validation.",
      "Open Report to review findings; waive or resolve with reasons.",
      "Set a baseline, compare candidates, export traceability and Audit ZIP.",
      "Delete the project when finished (soft delete with retention)."
    ]
  }
];

export const apiCliGuide: DocSection[] = [
  {
    heading: "Machine API",
    paragraphs: [
      "Project owners mint scoped tokens under /api/projects/:id/tokens (Professional+). Base paths live under /api/v1/projects/:projectId/ for models, specifications, validation-runs, and comparison. Idempotency-Key headers are supported on mutating calls."
    ]
  },
  {
    heading: "CLI",
    paragraphs: [
      "Install via the repository bin: npx aec-validator --help. Typical CI flow uploads a model and specification, runs validation against a baseline, and writes JSON/XLSX/Markdown artefacts. See examples/ci/ for GitHub Actions, GitLab CI, and Docker samples."
    ]
  }
];
