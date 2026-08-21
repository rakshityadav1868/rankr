import crypto from "crypto";
import { ensureSchema, sql } from "./db";

/** Cheapest bid that gets you onto an empty board. */
export const MIN_BID = 1;
/** Taking any occupied place costs this much more than the listing on it. */
export const STEP = 1;
/** Sanity ceiling so a typo cannot create a million dollar charge. */
export const MAX_BID = 100_000;

export type Listing = {
  id: string;
  url: string;
  host: string;
  label: string;
  title: string;
  description: string;
  amount: number;
  clicks: number;
  rank: number;
  updatedAt: number;
};

export type ActivityItem = {
  id: string;
  label: string;
  host: string;
  amount: number;
  rank: number;
  at: number;
};

export type Target = { url: string; urlKey: string; host: string; label: string };

const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "metadata.google.internal",
]);

/** Hosts that must never be fetched or listed (SSRF and junk protection). */
function hostIsBlocked(host: string): boolean {
  const h = host.toLowerCase();
  if (BLOCKED_HOSTS.has(h)) return true;
  if (h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".localhost")) return true;
  // Raw IP addresses, including every private and loopback range.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return true;
  if (h.includes(":")) return true; // bare IPv6
  return false;
}

/**
 * Turns whatever someone typed into a canonical listing target, or null when it
 * is not something we can put on the board.
 */
export function normalizeTarget(input: unknown): Target | null {
  if (typeof input !== "string") return null;
  let value = input.trim();
  if (!value || value.length > 300) return null;

  // "@handle" lists an X profile.
  if (value.startsWith("@")) {
    const handle = value.slice(1).trim().replace(/[^a-zA-Z0-9_]/g, "");
    if (!handle || handle.length > 15) return null;
    const url = `https://x.com/${handle}`;
    return { url, urlKey: `x.com/${handle.toLowerCase()}`, host: "x.com", label: `@${handle}` };
  }

  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value)) value = `https://${value}`;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (parsed.username || parsed.password) return null;
  if (parsed.port && parsed.port !== "80" && parsed.port !== "443") return null;

  // Affiliate, referral and tracking parameters are dropped, always.
  parsed.search = "";
  parsed.hash = "";
  parsed.protocol = "https:";
  parsed.port = "";

  const host = parsed.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  if (!host || host.length > 253 || !host.includes(".")) return null;
  if (!/^[a-z0-9.-]+$/.test(host)) return null; // URL() already punycodes unicode hosts
  if (!/\.[a-z]{2,}$/.test(host)) return null;
  if (hostIsBlocked(host)) return null;

  parsed.hostname = host;
  const path = parsed.pathname.replace(/\/+$/, "");
  const url = `${parsed.origin}${path || "/"}`;
  const label = path ? `${host}${path}` : host;

  return { url, urlKey: `${host}${path}`, host, label: label.length > 80 ? host : label };
}

/** Validates a typed bid amount. Whole dollars only, nothing exotic. */
export function parseAmount(input: unknown): number | null {
  const n = typeof input === "number" ? input : Number(String(input ?? "").trim());
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  if (n < MIN_BID || n > MAX_BID) return null;
  return n;
}

type ListingRow = {
  id: string;
  url: string;
  host: string;
  label: string;
  title: string;
  description: string;
  amount: number;
  clicks: number;
  rank: string | number;
  updated_at: string | Date;
};

function toListing(row: ListingRow): Listing {
  return {
    id: row.id,
    url: row.url,
    host: row.host,
    label: row.label,
    title: row.title,
    description: row.description,
    amount: row.amount,
    clicks: row.clicks,
    rank: Number(row.rank),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

/** Live records, recalculated from real board data on every load. */
export type Records = {
  /** Largest single settled payment. */
  topBid: { label: string; amount: number } | null;
  /** Longest run at place #1, past or ongoing. */
  reign: { label: string; seconds: number; current: boolean } | null;
  /** Listing with the most outbound clicks. */
  clicked: { label: string; clicks: number } | null;
};

export type BoardPage = {
  listings: Listing[];
  page: number;
  pageSize: number;
  total: number;
  pot: number;
  clicks: number;
  clicks24h: number;
  topAmount: number;
  activity: ActivityItem[];
  minBid: number;
  step: number;
  /** When the current #1 took the crown, epoch ms. */
  crownedAt: number | null;
  records: Records;
};

export async function getBoardPage(page: number, pageSize: number): Promise<BoardPage> {
  await ensureSchema();
  const safePage = Number.isInteger(page) && page >= 0 ? page : 0;
  const safeSize = Number.isInteger(pageSize) && pageSize > 0 && pageSize <= 100 ? pageSize : 20;

  // One round trip. Supabase's transaction pooler does not keep pipelined
  // queries in order, so the whole board is assembled in a single statement.
  const [row] = await sql<
    {
      listings: ListingRow[] | null;
      activity: { id: string; label: string; host: string; amount: number; rank: number; settled_at: string }[] | null;
      total: string;
      pot: string;
      clicks: string;
      top: string;
      clicks24h: string;
      leader: { label: string; crowned_at: string | null } | null;
      bigbid: { label: string; amount: number } | null;
      clicked: { label: string; clicks: number } | null;
      pastreign: { label: string; secs: number } | null;
    }[]
  >`
    WITH ranked AS (
      SELECT id, url, host, label, title, description, amount, clicks, updated_at,
             ROW_NUMBER() OVER (ORDER BY amount DESC, updated_at ASC, id ASC) AS rank
      FROM listings
    ),
    page AS (
      SELECT * FROM ranked ORDER BY rank LIMIT ${safeSize} OFFSET ${safePage * safeSize}
    ),
    stats AS (
      SELECT COUNT(*)::text AS total,
             COALESCE(SUM(amount), 0)::text AS pot,
             COALESCE(SUM(clicks), 0)::text AS clicks,
             COALESCE(MAX(amount), 0)::text AS top
      FROM listings
    ),
    recent AS (
      SELECT b.id, b.label, b.host, l.amount, b.rank_after AS rank, b.settled_at
      FROM bids b
      JOIN listings l ON l.id = b.listing_id
      WHERE b.status = 'paid' AND b.settled_at IS NOT NULL
      ORDER BY b.settled_at DESC
      LIMIT 12
    ),
    leader AS (
      SELECT label, crowned_at::text
      FROM listings ORDER BY amount DESC, updated_at ASC, id ASC LIMIT 1
    ),
    bigbid AS (
      SELECT label, applied_delta AS amount
      FROM bids WHERE status = 'paid' AND applied_delta IS NOT NULL
      ORDER BY applied_delta DESC, settled_at ASC LIMIT 1
    ),
    clicked AS (
      SELECT label, clicks FROM listings WHERE clicks > 0
      ORDER BY clicks DESC, updated_at ASC LIMIT 1
    ),
    pastreign AS (
      SELECT l.label, EXTRACT(EPOCH FROM (r.ended_at - r.started_at))::float AS secs
      FROM reigns r JOIN listings l ON l.id = r.listing_id
      ORDER BY r.ended_at - r.started_at DESC LIMIT 1
    )
    SELECT
      (SELECT json_agg(page ORDER BY page.rank) FROM page) AS listings,
      (SELECT json_agg(recent) FROM recent) AS activity,
      stats.total, stats.pot, stats.clicks, stats.top,
      (SELECT COUNT(*)::text FROM clicks WHERE at > now() - interval '24 hours') AS clicks24h,
      (SELECT row_to_json(leader) FROM leader) AS leader,
      (SELECT row_to_json(bigbid) FROM bigbid) AS bigbid,
      (SELECT row_to_json(clicked) FROM clicked) AS clicked,
      (SELECT row_to_json(pastreign) FROM pastreign) AS pastreign
    FROM stats
  `;

  const crownedAt = row.leader?.crowned_at ? new Date(row.leader.crowned_at).getTime() : null;
  const currentSecs = crownedAt ? Math.max(0, (Date.now() - crownedAt) / 1000) : 0;
  const pastSecs = row.pastreign?.secs ?? 0;
  const reign =
    currentSecs === 0 && pastSecs === 0
      ? null
      : currentSecs >= pastSecs
        ? { label: row.leader!.label, seconds: Math.round(currentSecs), current: true }
        : { label: row.pastreign!.label, seconds: Math.round(pastSecs), current: false };

  return {
    listings: (row.listings ?? []).map(toListing),
    page: safePage,
    pageSize: safeSize,
    total: Number(row.total),
    pot: Number(row.pot),
    clicks: Number(row.clicks),
    clicks24h: Number(row.clicks24h),
    topAmount: Number(row.top),
    activity: (row.activity ?? []).map((a) => ({
      id: a.id,
      label: a.label,
      host: a.host,
      amount: a.amount,
      rank: a.rank,
      at: new Date(a.settled_at).getTime(),
    })),
    minBid: MIN_BID,
    step: STEP,
    crownedAt,
    records: {
      topBid: row.bigbid ? { label: row.bigbid.label, amount: row.bigbid.amount } : null,
      reign,
      clicked: row.clicked ? { label: row.clicked.label, clicks: row.clicked.clicks } : null,
    },
  };
}

export type Quote = {
  label: string;
  host: string;
  currentTotal: number;
  currentRank: number | null;
  minTotal: number;
  topPrice: number;
  topAmount: number;
  /** Where the asked-for total would land, when an amount was supplied. */
  projectedRank: number | null;
};

/**
 * What this target costs right now, straight from the database.
 *
 * When `amount` is given it also works out the place that total would buy.
 * Anything already sitting on the same total keeps the better place, because
 * ties go to whoever got there first, so matching the top of the board lands
 * you just under it rather than on it.
 */
export async function quoteFor(target: Target, amount?: number | null): Promise<Quote> {
  await ensureSchema();
  const asked = typeof amount === "number" && Number.isInteger(amount) && amount > 0 ? amount : null;

  const [row] = await sql<
    { amount: number | null; rank: string | null; top: string; projected: string | null }[]
  >`
    WITH ranked AS (
      SELECT url_key, amount,
             ROW_NUMBER() OVER (ORDER BY amount DESC, updated_at ASC, id ASC) AS rank
      FROM listings
    )
    SELECT
      (SELECT amount FROM ranked WHERE url_key = ${target.urlKey}) AS amount,
      (SELECT rank::text FROM ranked WHERE url_key = ${target.urlKey}) AS rank,
      (SELECT COALESCE(MAX(amount), 0)::text FROM listings) AS top,
      CASE WHEN ${asked}::int IS NULL THEN NULL ELSE (
        SELECT (COUNT(*) + 1)::text
        FROM listings
        WHERE amount >= ${asked}::int AND url_key <> ${target.urlKey}
      ) END AS projected
  `;

  const currentTotal = row.amount ?? 0;
  const topAmount = Number(row.top);

  return {
    label: target.label,
    host: target.host,
    currentTotal,
    currentRank: row.rank ? Number(row.rank) : null,
    minTotal: Math.max(MIN_BID, currentTotal + STEP),
    topPrice: Math.max(MIN_BID, topAmount + STEP),
    topAmount,
    projectedRank: row.projected ? Number(row.projected) : null,
  };
}

export type PendingBid = {
  id: string;
  target: Target;
  targetTotal: number;
  chargeCents: number;
};

/**
 * Records a bid that has not been paid for yet. The charge is the gap between
 * the listing's current total and the total the bidder asked for.
 */
export async function createPendingBid(args: {
  target: Target;
  targetTotal: number;
  title: string;
  description: string;
}): Promise<PendingBid> {
  await ensureSchema();
  const quote = await quoteFor(args.target);
  const charge = args.targetTotal - quote.currentTotal;
  if (charge < STEP) {
    throw new Error(
      `${args.target.label} is already at $${quote.currentTotal}. Bid at least $${quote.minTotal}.`
    );
  }

  const id = crypto.randomBytes(12).toString("hex");
  await sql`
    INSERT INTO bids (id, url_key, url, host, label, title, description, target_total, charge_cents)
    VALUES (${id}, ${args.target.urlKey}, ${args.target.url}, ${args.target.host},
            ${args.target.label}, ${args.title}, ${args.description},
            ${args.targetTotal}, ${charge * 100})
  `;

  return { id, target: args.target, targetTotal: args.targetTotal, chargeCents: charge * 100 };
}

export type SettledBid = { listingId: string; amount: number; rank: number; delta: number };

/**
 * Applies a paid bid exactly once. The dollars paid are ADDED to the listing's
 * lifetime total, so a bid that was outbid while the card was being charged
 * still credits every dollar it paid for.
 */
export async function settleBid(bidId: string, paymentId: string | null): Promise<SettledBid | null> {
  await ensureSchema();
  return sql.begin(async (tx) => {
    const claimed = await tx<
      {
        id: string;
        url_key: string;
        url: string;
        host: string;
        label: string;
        title: string;
        description: string;
        charge_cents: number;
      }[]
    >`
      UPDATE bids
      SET status = 'paid', settled_at = now(), payment_id = COALESCE(${paymentId}, payment_id)
      WHERE id = ${bidId} AND status = 'pending'
      RETURNING id, url_key, url, host, label, title, description, charge_cents
    `;

    // Already settled: report the existing placement instead of paying twice.
    if (claimed.length === 0) {
      const done = await tx<{ listing_id: string; rank_after: number; applied_delta: number; amount: number }[]>`
        SELECT b.listing_id, b.rank_after, b.applied_delta, l.amount
        FROM bids b LEFT JOIN listings l ON l.id = b.listing_id
        WHERE b.id = ${bidId} AND b.status = 'paid'
      `;
      if (done.length === 0 || !done[0].listing_id) return null;
      return {
        listingId: done[0].listing_id,
        amount: done[0].amount,
        rank: done[0].rank_after,
        delta: done[0].applied_delta,
      };
    }

    const bid = claimed[0];
    const delta = Math.round(bid.charge_cents / 100);
    const listingId = crypto.randomBytes(8).toString("hex");

    const [listing] = await tx<{ id: string; amount: number }[]>`
      INSERT INTO listings (id, url_key, url, host, label, title, description, amount)
      VALUES (${listingId}, ${bid.url_key}, ${bid.url}, ${bid.host}, ${bid.label},
              ${bid.title}, ${bid.description}, ${delta})
      ON CONFLICT (url_key) DO UPDATE SET
        amount = listings.amount + EXCLUDED.amount,
        updated_at = now(),
        title = CASE WHEN listings.title = '' THEN EXCLUDED.title ELSE listings.title END,
        description = CASE WHEN listings.description = '' THEN EXCLUDED.description ELSE listings.description END
      RETURNING id, amount
    `;

    const [{ rank }] = await tx<{ rank: string }[]>`
      SELECT rank FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY amount DESC, updated_at ASC, id ASC) AS rank
        FROM listings
      ) ranked WHERE id = ${listing.id}
    `;

    await tx`
      UPDATE bids
      SET listing_id = ${listing.id}, applied_delta = ${delta}, rank_after = ${Number(rank)}
      WHERE id = ${bid.id}
    `;

    // Crown bookkeeping: when the leader changed, the dethroned run is filed
    // into reigns and the new leader's clock starts now.
    const [leader] = await tx<{ id: string; crowned_at: string | null }[]>`
      SELECT id, crowned_at FROM listings ORDER BY amount DESC, updated_at ASC, id ASC LIMIT 1
    `;
    if (leader && !leader.crowned_at) {
      await tx`
        INSERT INTO reigns (listing_id, started_at, ended_at)
        SELECT id, crowned_at, now() FROM listings
        WHERE crowned_at IS NOT NULL AND id <> ${leader.id}
      `;
      await tx`UPDATE listings SET crowned_at = NULL WHERE crowned_at IS NOT NULL AND id <> ${leader.id}`;
      await tx`UPDATE listings SET crowned_at = now() WHERE id = ${leader.id}`;
    }

    return { listingId: listing.id, amount: listing.amount, rank: Number(rank), delta };
  });
}

export async function markBidFailed(bidId: string, status: "failed" | "cancelled"): Promise<void> {
  await ensureSchema();
  await sql`UPDATE bids SET status = ${status} WHERE id = ${bidId} AND status = 'pending'`;
}

export type BidRecord = {
  id: string;
  status: string;
  session_id: string | null;
  charge_cents: number;
  rank_after: number | null;
  label: string;
};

export async function getBid(bidId: string): Promise<BidRecord | null> {
  await ensureSchema();
  const rows = await sql<BidRecord[]>`
    SELECT id, status, session_id, charge_cents, rank_after, label FROM bids WHERE id = ${bidId}
  `;
  return rows[0] ?? null;
}

/** Paid bids whose checkout was never confirmed, oldest first. */
export async function pendingBidsToCheck(limit: number): Promise<BidRecord[]> {
  await ensureSchema();
  return sql<BidRecord[]>`
    SELECT id, status, session_id, charge_cents, rank_after, label
    FROM bids
    WHERE status = 'pending'
      AND session_id IS NOT NULL
      AND created_at > now() - interval '24 hours'
      AND created_at < now() - interval '45 seconds'
    ORDER BY created_at ASC
    LIMIT ${limit}
  `;
}

/** Corrects the charge to what was actually paid, in whole dollars. */
export async function setChargeCents(bidId: string, cents: number): Promise<void> {
  const safe = Math.max(100, Math.floor(cents / 100) * 100);
  await sql`UPDATE bids SET charge_cents = ${safe} WHERE id = ${bidId} AND status = 'pending'`;
}

export async function getBidStatus(bidId: string) {
  await ensureSchema();
  const rows = await sql<{ status: string; rank_after: number | null; label: string; target_total: number }[]>`
    SELECT status, rank_after, label, target_total FROM bids WHERE id = ${bidId}
  `;
  return rows[0] ?? null;
}

export async function attachSession(bidId: string, sessionId: string): Promise<void> {
  await sql`UPDATE bids SET session_id = ${sessionId} WHERE id = ${bidId}`;
}

/** Counts an outbound click and hands back the destination. */
export async function registerClick(id: string): Promise<string | null> {
  if (!/^[a-f0-9]{16}$/.test(id)) return null;
  await ensureSchema();
  const rows = await sql<{ url: string }[]>`
    UPDATE listings SET clicks = clicks + 1 WHERE id = ${id} RETURNING url
  `;
  if (rows.length === 0) return null;
  // Fire and forget: the click log only feeds the 24 hour counter.
  sql`INSERT INTO clicks (listing_id) VALUES (${id})`.catch(() => {});
  return rows[0].url;
}
