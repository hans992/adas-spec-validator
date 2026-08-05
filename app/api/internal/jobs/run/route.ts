import { cleanupFinishedJobPayloads, processDueJobs } from "@/jobs/validationJobs";

export const runtime = "nodejs";

/**
 * Worker tick for background validation jobs. Invoke from a scheduler (e.g. a
 * cron hitting this endpoint every minute) so jobs progress even when nobody
 * is polling from a browser. Each tick advances due jobs by one phase and
 * clears expired temporary payloads.
 */
export async function POST(request: Request) {
  const configured = process.env.JOB_RUNNER_SECRET;
  const authorization = request.headers.get("authorization");
  if (!configured || authorization !== `Bearer ${configured}`) {
    return Response.json({ error: "Job runner authentication failed." }, { status: 401 });
  }
  try {
    const requested = Number(new URL(request.url).searchParams.get("limit") ?? "5");
    const processed = await processDueJobs(Number.isFinite(requested) ? requested : 5);
    const cleaned = await cleanupFinishedJobPayloads();
    return Response.json({ processed, cleaned });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : "Job runner tick failed."
    }, { status: 500 });
  }
}
