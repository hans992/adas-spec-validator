import { auditEvent } from "@/observability/logger";
import { serviceSupabaseRequest } from "@/persistence/serviceSupabase";

export interface AuditEventRecord {
  event: string;
  actorId?: string;
  projectId?: string;
  targetId?: string;
  requestId?: string;
  outcome?: "success" | "denied" | "failure";
  metadata?: Record<string, string | number | boolean>;
}

/**
 * Records an audit event as a structured log line and, when the service role is
 * configured, durably in the audit_events table. Persistence problems never
 * break the calling request — the log line remains the fallback trail.
 */
export async function recordAuditEvent(record: AuditEventRecord): Promise<void> {
  auditEvent(record.event, {
    actorId: record.actorId,
    projectId: record.projectId,
    targetId: record.targetId,
    requestId: record.requestId,
    outcome: record.outcome ?? "success"
  });
  try {
    await serviceSupabaseRequest("audit_events", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        event: record.event,
        actor_id: record.actorId ?? null,
        project_id: record.projectId ?? null,
        target_id: record.targetId ?? null,
        request_id: record.requestId ?? null,
        outcome: record.outcome ?? "success",
        metadata: record.metadata ?? {}
      })
    });
  } catch {
    // Logged above; a missing service role or transient failure is acceptable.
  }
}
