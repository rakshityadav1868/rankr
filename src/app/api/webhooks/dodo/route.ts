import { NextResponse } from "next/server";
import { markBidFailed, settleBid } from "@/lib/board";
import { verifyWebhook, webhooksConfigured } from "@/lib/payments";

export const dynamic = "force-dynamic";

/** Dodo Payments webhook. This is the only thing that can move money onto the board. */
export async function POST(req: Request) {
  if (!webhooksConfigured()) {
    return NextResponse.json({ error: "Webhooks are not configured" }, { status: 503 });
  }

  const raw = await req.text();

  let event;
  try {
    event = verifyWebhook(raw, req.headers);
  } catch (err) {
    console.error("webhook signature rejected", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const bidId = event.data?.metadata?.bid_id;
  if (!bidId) return NextResponse.json({ ok: true, ignored: "no bid id" });

  try {
    switch (event.type) {
      case "payment.succeeded": {
        const settled = await settleBid(bidId, event.data?.payment_id ?? null);
        return NextResponse.json({ ok: true, rank: settled?.rank ?? null });
      }
      case "payment.failed":
        await markBidFailed(bidId, "failed");
        return NextResponse.json({ ok: true });
      case "payment.cancelled":
        await markBidFailed(bidId, "cancelled");
        return NextResponse.json({ ok: true });
      default:
        return NextResponse.json({ ok: true, ignored: event.type });
    }
  } catch (err) {
    // A non 2xx tells Dodo to retry, which is what we want if the database blipped.
    console.error("webhook handling failed", err);
    return NextResponse.json({ error: "Retry" }, { status: 500 });
  }
}
