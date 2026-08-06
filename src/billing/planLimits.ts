/**
 * Commercial plan definitions and enforcement helpers.
 *
 * Limits are enforced on mutating API routes — not only displayed on the
 * marketing page. Missing account_plans rows default to starter.
 */
import { PersistenceError } from "@/persistence/supabaseRest";
import { serviceSupabaseRequest } from "@/persistence/serviceSupabase";
import { supabaseRequest } from "@/persistence/supabaseRest";

export type PlanId = "starter" | "professional" | "enterprise";

export type PlanLimits = {
  id: PlanId;
  name: string;
  priceMonthlyEur: number;
  tagline: string;
  maxProjects: number;
  maxMembersPerProject: number;
  monthlyValidationRuns: number;
  storageBytes: number;
  maxFileBytes: number;
  monthlyAuditExports: number;
  apiAccess: boolean;
  retentionDays: number;
  highlights: string[];
};

export const PLANS: Record<PlanId, PlanLimits> = {
  starter: {
    id: "starter",
    name: "Starter",
    priceMonthlyEur: 0,
    tagline: "For evaluating the workflow on a real project.",
    maxProjects: 2,
    maxMembersPerProject: 3,
    monthlyValidationRuns: 25,
    storageBytes: 200 * 1024 * 1024,
    maxFileBytes: 10 * 1024 * 1024,
    monthlyAuditExports: 5,
    apiAccess: false,
    retentionDays: 30,
    highlights: [
      "2 projects",
      "3 members per project",
      "25 validation runs / month",
      "200 MB storage · 10 MB files",
      "5 audit exports / month",
      "30-day retention"
    ]
  },
  professional: {
    id: "professional",
    name: "Professional",
    priceMonthlyEur: 149,
    tagline: "For delivery teams that need review, regression and CI.",
    maxProjects: 15,
    maxMembersPerProject: 15,
    monthlyValidationRuns: 250,
    storageBytes: 5 * 1024 * 1024 * 1024,
    maxFileBytes: 50 * 1024 * 1024,
    monthlyAuditExports: 100,
    apiAccess: true,
    retentionDays: 365,
    highlights: [
      "15 projects",
      "15 members per project",
      "250 validation runs / month",
      "5 GB storage · 50 MB files",
      "100 audit exports / month",
      "API / CLI / CI access",
      "365-day retention"
    ]
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    priceMonthlyEur: 0,
    tagline: "Custom limits, SSO readiness and dedicated support.",
    maxProjects: 500,
    maxMembersPerProject: 200,
    monthlyValidationRuns: 10_000,
    storageBytes: 200 * 1024 * 1024 * 1024,
    maxFileBytes: 100 * 1024 * 1024,
    monthlyAuditExports: 5_000,
    apiAccess: true,
    retentionDays: 2555,
    highlights: [
      "Custom project and seat counts",
      "High-volume validation runs",
      "Large model storage",
      "API / CLI / CI included",
      "Multi-year retention",
      "EU region and subprocessors as documented"
    ]
  }
};

export type PlanUsage = {
  projects: number;
  monthlyValidationRuns: number;
  monthlyAuditExports: number;
  storageBytes: number;
};

export function currentUsageMonth(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function planLimitError(message: string): PersistenceError {
  return new PersistenceError(message, 402);
}

/** Resolve the caller's plan (JWT). Missing rows → starter. */
export async function resolveAccountPlan(token: string, userId: string): Promise<PlanLimits> {
  const forced = process.env.FORCE_ACCOUNT_PLAN as PlanId | undefined;
  if (forced && PLANS[forced]) return PLANS[forced];
  try {
    const rows = await supabaseRequest<Array<{ plan: PlanId }>>(token,
      `account_plans?user_id=eq.${encodeURIComponent(userId)}&select=plan&limit=1`
    );
    return PLANS[rows[0]?.plan ?? "starter"] ?? PLANS.starter;
  } catch {
    return PLANS.starter;
  }
}

export async function ensureAccountPlan(userId: string, plan: PlanId = "starter"): Promise<void> {
  try {
    await serviceSupabaseRequest("account_plans?on_conflict=user_id", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify({ user_id: userId, plan })
    });
  } catch {
    // Plan bootstrap is best-effort; enforcement falls back to starter.
  }
}

async function readUsageRow(token: string, userId: string, month: string): Promise<{
  validation_runs: number;
  audit_exports: number;
  storage_bytes: number;
}> {
  const rows = await supabaseRequest<Array<{
    validation_runs: number;
    audit_exports: number;
    storage_bytes: number;
  }>>(token,
    `account_usage_months?user_id=eq.${encodeURIComponent(userId)}&month=eq.${encodeURIComponent(month)}&select=validation_runs,audit_exports,storage_bytes&limit=1`
  );
  return rows[0] ?? { validation_runs: 0, audit_exports: 0, storage_bytes: 0 };
}

/** Live project count for the owner (soft-deleted excluded). */
export async function countOwnedProjects(token: string, userId: string): Promise<number> {
  const rows = await supabaseRequest<Array<{ id: string }>>(token,
    `projects?owner_id=eq.${encodeURIComponent(userId)}&deleted_at=is.null&select=id`
  );
  return rows.length;
}

export async function countProjectMembers(token: string, projectId: string): Promise<number> {
  const rows = await supabaseRequest<Array<{ user_id: string }>>(token,
    `project_members?project_id=eq.${encodeURIComponent(projectId)}&select=user_id`
  );
  // Owner is not in project_members; seat count = members + owner.
  return rows.length + 1;
}

/**
 * Approximate stored bytes from owned model assets (JSON length) and evidence
 * file sizes. Counters in account_usage_months are additive for uploads that
 * never become assets (e.g. rejected jobs still temporarily occupy space).
 */
export async function estimateStorageBytes(token: string, userId: string): Promise<number> {
  const projects = await supabaseRequest<Array<{ id: string }>>(token,
    `projects?owner_id=eq.${encodeURIComponent(userId)}&deleted_at=is.null&select=id`
  );
  if (projects.length === 0) return 0;
  const ids = projects.map((project) => project.id);
  const filter = `project_id=in.(${ids.map(encodeURIComponent).join(",")})`;
  const [assets, evidence, jobs] = await Promise.all([
    supabaseRequest<Array<{ normalized_model?: unknown; source_file_name?: string }>>(token,
      `project_model_assets?${filter}&select=normalized_model,source_file_name`
    ).catch(() => []),
    supabaseRequest<Array<{ file_size_bytes?: number | null }>>(token,
      `finding_evidence?${filter}&select=file_size_bytes`
    ).catch(() => []),
    supabaseRequest<Array<{ input_size_bytes?: number | null }>>(token,
      `validation_jobs?${filter}&status=in.(queued,processing)&select=input_size_bytes`
    ).catch(() => [])
  ]);
  const assetBytes = assets.reduce((sum, asset) =>
    sum + Buffer.byteLength(JSON.stringify(asset.normalized_model ?? {}), "utf8"), 0);
  const evidenceBytes = evidence.reduce((sum, row) => sum + (row.file_size_bytes ?? 0), 0);
  const jobBytes = jobs.reduce((sum, row) => sum + (row.input_size_bytes ?? 0), 0);
  return assetBytes + evidenceBytes + jobBytes;
}

export async function collectPlanUsage(token: string, userId: string, now = new Date()): Promise<PlanUsage> {
  const month = currentUsageMonth(now);
  const [projects, usage, storageBytes] = await Promise.all([
    countOwnedProjects(token, userId),
    readUsageRow(token, userId, month),
    estimateStorageBytes(token, userId)
  ]);
  return {
    projects,
    monthlyValidationRuns: usage.validation_runs,
    monthlyAuditExports: usage.audit_exports,
    storageBytes: Math.max(storageBytes, usage.storage_bytes)
  };
}

async function bumpUsage(
  userId: string,
  field: "validation_runs" | "audit_exports" | "storage_bytes",
  delta: number,
  now = new Date()
): Promise<void> {
  const month = currentUsageMonth(now);
  try {
    const existing = await serviceSupabaseRequest<Array<Record<string, number>>>(
      `account_usage_months?user_id=eq.${encodeURIComponent(userId)}&month=eq.${encodeURIComponent(month)}&select=validation_runs,audit_exports,storage_bytes&limit=1`
    );
    const current = existing[0] ?? { validation_runs: 0, audit_exports: 0, storage_bytes: 0 };
    await serviceSupabaseRequest("account_usage_months?on_conflict=user_id,month", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({
        user_id: userId,
        month,
        validation_runs: field === "validation_runs" ? current.validation_runs + delta : current.validation_runs,
        audit_exports: field === "audit_exports" ? current.audit_exports + delta : current.audit_exports,
        storage_bytes: field === "storage_bytes" ? current.storage_bytes + delta : current.storage_bytes,
        updated_at: new Date().toISOString()
      })
    });
  } catch {
    // Usage accounting must never block the primary action when the service role is missing.
  }
}

export async function assertCanCreateProject(token: string, userId: string): Promise<PlanLimits> {
  const plan = await resolveAccountPlan(token, userId);
  const count = await countOwnedProjects(token, userId);
  if (count >= plan.maxProjects) {
    throw planLimitError(
      `Your ${plan.name} plan allows ${plan.maxProjects} project${plan.maxProjects === 1 ? "" : "s"}. Delete an unused project or upgrade to continue.`
    );
  }
  return plan;
}

export async function assertCanInviteMember(token: string, userId: string, projectId: string): Promise<PlanLimits> {
  const plan = await resolveAccountPlan(token, userId);
  const seats = await countProjectMembers(token, projectId);
  if (seats >= plan.maxMembersPerProject) {
    throw planLimitError(
      `Your ${plan.name} plan allows ${plan.maxMembersPerProject} members per project (including the owner). Remove a member or upgrade to invite more people.`
    );
  }
  return plan;
}

export async function assertCanRunValidation(token: string, userId: string): Promise<PlanLimits> {
  const plan = await resolveAccountPlan(token, userId);
  const usage = await readUsageRow(token, userId, currentUsageMonth());
  if (usage.validation_runs >= plan.monthlyValidationRuns) {
    throw planLimitError(
      `Your ${plan.name} plan allows ${plan.monthlyValidationRuns} validation runs this month. Wait for the next billing month or upgrade.`
    );
  }
  return plan;
}

export async function recordValidationRunUsage(userId: string): Promise<void> {
  await bumpUsage(userId, "validation_runs", 1);
}

export async function assertCanExportAudit(token: string, userId: string): Promise<PlanLimits> {
  const plan = await resolveAccountPlan(token, userId);
  const usage = await readUsageRow(token, userId, currentUsageMonth());
  if (usage.audit_exports >= plan.monthlyAuditExports) {
    throw planLimitError(
      `Your ${plan.name} plan allows ${plan.monthlyAuditExports} audit exports this month. Upgrade to continue exporting.`
    );
  }
  return plan;
}

export async function recordAuditExportUsage(userId: string): Promise<void> {
  await bumpUsage(userId, "audit_exports", 1);
}

export async function assertCanUseApi(token: string, userId: string): Promise<PlanLimits> {
  const plan = await resolveAccountPlan(token, userId);
  if (!plan.apiAccess) {
    throw planLimitError(
      `API and CI access is not included in the ${plan.name} plan. Upgrade to Professional or Enterprise to create project API tokens.`
    );
  }
  return plan;
}

export async function assertFileWithinPlan(
  token: string,
  userId: string,
  sizeBytes: number
): Promise<PlanLimits> {
  const plan = await resolveAccountPlan(token, userId);
  if (sizeBytes > plan.maxFileBytes) {
    throw planLimitError(
      `Your ${plan.name} plan accepts files up to ${formatBytes(plan.maxFileBytes)}. This file is ${formatBytes(sizeBytes)}.`
    );
  }
  const usage = await collectPlanUsage(token, userId);
  if (usage.storageBytes + sizeBytes > plan.storageBytes) {
    throw planLimitError(
      `Your ${plan.name} plan includes ${formatBytes(plan.storageBytes)} of storage and ${formatBytes(usage.storageBytes)} is already in use. Delete unused models or upgrade.`
    );
  }
  return plan;
}

export async function recordStorageUsage(userId: string, bytes: number): Promise<void> {
  if (bytes > 0) await bumpUsage(userId, "storage_bytes", bytes);
}
