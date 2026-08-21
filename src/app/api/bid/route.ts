import { NextResponse } from "next/server";
import {
  createPendingBid,
  MAX_BID,
  MIN_BID,
  normalizeTarget,
  parseAmount,
  quoteFor,
  settleBid,
  attachSession,
} from "@/lib/board";
import { fetchSiteMeta } from "@/lib/metadata";
import { allowUnpaidBids, createCheckout, paymentsConfigured } from "@/lib/payments";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const input = (body ?? {}) as { url?: unknown; amount?: unknown };

  const target = normalizeTarget(input.url);
  if (!target) {
    return NextResponse.json(
      { error: "That does not look like a website or an @handle." },
      { status: 400 }
    );
  }

  const amount = parseAmount(input.amount);
  if (amount === null) {
    return NextResponse.json(
      { error: `Bids are whole dollars between $${MIN_BID} and $${MAX_BID.toLocaleString()}.` },
      { status: 400 }
    );
  }

  if (!paymentsConfigured() && !allowUnpaidBids) {
    return NextResponse.json(
      { error: "Bidding is closed for a moment. Payments are being set up." },
      { status: 503 }
    );
  }

  try {
    const quote = await quoteFor(target);
    if (amount < quote.minTotal) {
      return NextResponse.json(
        {
          error: quote.currentTotal
            ? `${target.label} is already at $${quote.currentTotal}. Bid at least $${quote.minTotal}.`
            : `The smallest bid is $${quote.minTotal}.`,
          minTotal: quote.minTotal,
        },
        { status: 400 }
      );
    }

    const meta = quote.currentTotal ? { title: "", description: "" } : await fetchSiteMeta(target.url);
    const bid = await createPendingBid({
      target,
      targetTotal: amount,
      title: meta.title,
      description: meta.description,
    });

    if (paymentsConfigured()) {
      const checkout = await createCheckout({
        bidId: bid.id,
        chargeCents: bid.chargeCents,
        label: target.label,
      });
      await attachSession(bid.id, checkout.sessionId);
      return NextResponse.json({ bidId: bid.id, checkoutUrl: checkout.checkoutUrl });
    }

    // Local development only: settle straight away so the board can be exercised.
    const settled = await settleBid(bid.id, null);
    return NextResponse.json({
      bidId: bid.id,
      settled: true,
      rank: settled?.rank,
      amount: settled?.amount,
      charged: settled?.delta,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not place that bid.";
    console.error("bid failed", err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
