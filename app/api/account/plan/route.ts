import { collectPlanUsage, PLANS, resolveAccountPlan, type PlanId } from "@/billing/planLimits";
import {
  authenticatedUserId,
  bearerToken,
  persistenceResponse
} from "@/persistence/supabaseRest";

export const runtime = "nodejs";

/** Returns the caller's plan, usage counters, and the public plan catalogue. */
export async function GET(request: Request) {
  try {
    const token = bearerToken(request);
    const userId = await authenticatedUserId(token);
    const plan = await resolveAccountPlan(token, userId);
    const usage = await collectPlanUsage(token, userId);
    return Response.json({
      plan,
      usage,
      catalogue: Object.values(PLANS).map((entry) => ({
        id: entry.id as PlanId,
        name: entry.name,
        priceMonthlyEur: entry.priceMonthlyEur,
        tagline: entry.tagline,
        highlights: entry.highlights,
        maxProjects: entry.maxProjects,
        maxMembersPerProject: entry.maxMembersPerProject,
        monthlyValidationRuns: entry.monthlyValidationRuns,
        storageBytes: entry.storageBytes,
        maxFileBytes: entry.maxFileBytes,
        monthlyAuditExports: entry.monthlyAuditExports,
        apiAccess: entry.apiAccess,
        retentionDays: entry.retentionDays
      }))
    });
  } catch (error) {
    return persistenceResponse(error);
  }
}
