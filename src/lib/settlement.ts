import { getBid, markBidFailed, pendingBidsToCheck, setChargeCents, settleBid } from "./board";
import { checkSession, paymentsConfigured } from "./payments";

export type SettleOutcome =
  | { status: "paid"; rank: number | null; label: string }
  | { status: "pending"; label: string }
  | { status: "failed" | "cancelled"; label: string }
  | { status: "unknown" };

/**
 * Confirms one bid against Dodo and, if the money landed, puts it on the board.
 * Safe to call repeatedly: settling is idempotent.
 */
export async function verifyAndSettle(bidId: string): Promise<SettleOutcome> {
  const bid = await getBid(bidId);
  if (!bid) return { status: "unknown" };

  if (bid.status === "paid") return { status: "paid", rank: bid.rank_after, label: bid.label };
  if (bid.status === "failed" || bid.status === "cancelled")
    return { status: bid.status, label: bid.label };

  if (!bid.session_id || !paymentsConfigured()) return { status: "pending", label: bid.label };

  const check = await checkSession(bid.session_id);
  if (check.state === "pending") return { status: "pending", label: bid.label };
  if (check.state === "failed") {
    await markBidFailed(bidId, "failed");
    return { status: "failed", label: bid.label };
  }

  // Never credit more than was actually paid.
  if (check.amountCents > 0 && check.amountCents < bid.charge_cents) {
    await setChargeCents(bidId, check.amountCents);
  }

  const settled = await settleBid(bidId, check.paymentId);
  return { status: "paid", rank: settled?.rank ?? null, label: bid.label };
}

let lastSweep = 0;

/**
 * Catches bids whose payer closed the tab before coming back. Runs at most once
 * a minute per instance and only looks at a handful of bids.
 */
export async function sweepPendingBids(): Promise<void> {
  if (!paymentsConfigured()) return;
  const now = Date.now();
  if (now - lastSweep < 60_000) return;
  lastSweep = now;

  try {
    const pending = await pendingBidsToCheck(10);
    for (const bid of pending) {
      await verifyAndSettle(bid.id).catch(() => {});
    }
  } catch {
    // A sweep failure must never break a page load.
  }
}
