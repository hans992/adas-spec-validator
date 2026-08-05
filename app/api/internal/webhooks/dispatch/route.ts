import { dispatchPendingWebhookDeliveries } from "@/persistence/webhookDelivery";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const configured = process.env.WEBHOOK_DISPATCH_SECRET;
  const authorization = request.headers.get("authorization");
  if (!configured || authorization !== `Bearer ${configured}`) {
    return Response.json({ error: "Dispatcher authentication failed." }, { status: 401 });
  }
  try {
    const requested = Number(new URL(request.url).searchParams.get("limit") ?? "20");
    const processed = await dispatchPendingWebhookDeliveries(
      Number.isFinite(requested) ? requested : 20
    );
    return Response.json({ processed });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : "Webhook dispatch failed."
    }, { status: 500 });
  }
}
