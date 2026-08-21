# rankr.lol

A single public leaderboard where the ranking is one number: dollars paid.
Next.js 16 (App Router), Tailwind 4, Supabase Postgres, Dodo Payments. No auth.

## How the board works

- Your place is your lifetime total in whole dollars, highest first.
- The first bid on an empty board is **$1**. After that, taking any place costs
  **one dollar more** than the listing sitting on it, so the top spot climbs
  $1, $2, $3 and up.
- Already listed? You are charged only the **difference** between your current
  total and the total you asked for.
- Ties are broken by who got there first.
- Money is added to your total when the payment clears, so a bid that gets
  outbid mid checkout still credits every dollar it paid.
- Nothing expires and nothing is removed by being outbid.

Constants live at the top of `src/lib/board.ts` (`MIN_BID`, `STEP`, `MAX_BID`).

## Setup

### 1. Supabase

Create a project, then copy **Project Settings → Database → Connection string →
URI**. Use the **Transaction pooler** string (port 6543) if you deploy to
Vercel or any serverless host. Put it in `DATABASE_URL`.

Tables are created automatically on the first request, guarded by a Postgres
advisory lock so parallel cold starts cannot collide. To create them up front
instead, paste `schema.sql` into the Supabase SQL editor.

### 2. Dodo Payments

1. Create one product with **pay what you want** enabled, minimum price $1.
   Every bid charges into that product with its own amount, so one product
   covers the whole board. Put its id in `DODO_PRODUCT_ID`.
2. Copy an API key into `DODO_API_KEY`.
3. Set `DODO_ENV` to `test` while testing, `live` when you go live.

**The webhook is optional.** A bid is settled by asking Dodo about the checkout
session directly, so the browser coming back from checkout can never fake a
payment. Three things trigger that check: the page polling after checkout, a
sweep that runs when the board is loaded (for payers who closed the tab), and
the webhook when it is configured.

To add the webhook anyway, point it at `https://yourdomain.com/api/webhooks/dodo`
and put its signing key in `DODO_WEBHOOK_KEY`. It verifies the Standard Webhooks
signature. Settling is idempotent, so a payment confirmed twice is still only
credited once.

### 3. Environment

Copy `.env.example` to `.env.local` and fill it in. On Vercel, add the same
variables under Project Settings → Environment Variables.

```bash
npm install
npm run dev
```

Without Dodo keys the bid endpoint refuses to place bids. For local work you can
set `ALLOW_UNPAID_BIDS="true"`, which settles bids without charging. It is
ignored when `NODE_ENV=production`.

## Payment flow

1. `POST /api/bid` validates the link and the amount, prices the gap against the
   live database, writes a `pending` row in `bids`, and opens a Dodo checkout.
2. The bidder pays and comes back to `/?bid=<id>`. The page polls
   `/api/bid-status`, which asks Dodo whether that session was actually paid and
   for how much.
3. Once Dodo says the payment succeeded, the bid is marked paid inside one
   transaction and the dollars are added to the listing total.

Nothing in that chain trusts the browser, and a listing can never appear without
a payment Dodo confirms.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | The board, the bid form, live stats |
| `/rules`, `/about` | Static pages |
| `GET /api/board?page=&pageSize=` | Ranked page of listings plus totals |
| `GET /api/preview?url=` | Live price quote for a link |
| `POST /api/bid` | Starts a bid, returns a checkout url |
| `GET /api/bid-status?id=` | Polls one bid after checkout |
| `POST /api/webhooks/dodo` | Optional. Settles paid bids on Dodo's signal |
| `GET /go/[id]` | Counts a click and redirects |

## Deploying

Put every variable from `.env.local` into your host's environment. On Vercel,
pick a region close to your Supabase project (Supabase in `ap-northeast-1` pairs
with `hnd1`), otherwise every query pays a round trip across the world.

## What is guarded

- Whole dollars only, between `$1` and `$100,000`. Decimals, negatives, `NaN`,
  strings and out of range values are rejected.
- Links are canonicalised: `www.` dropped, trailing slash dropped, query strings
  and fragments stripped, so affiliate and tracking URLs cannot be listed and
  the same site cannot be listed twice.
- `localhost`, raw IP addresses, private ranges, internal TLDs, credentials in
  URLs and non http protocols are refused.
- Every database write is a single statement or one transaction, so parallel
  bids cannot lose or duplicate dollars.
- Webhook settlement is idempotent and signature checked.
