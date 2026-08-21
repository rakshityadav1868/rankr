-- rankr.lol schema. The app creates this automatically on first request,
-- but you can paste it into the Supabase SQL editor to set it up up front.

CREATE TABLE IF NOT EXISTS listings (
  id           text PRIMARY KEY,
  url_key      text NOT NULL UNIQUE,
  url          text NOT NULL,
  host         text NOT NULL,
  label        text NOT NULL,
  title        text NOT NULL DEFAULT '',
  description  text NOT NULL DEFAULT '',
  amount       integer NOT NULL CHECK (amount >= 0),
  clicks       integer NOT NULL DEFAULT 0 CHECK (clicks >= 0),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS listings_rank_idx ON listings (amount DESC, updated_at ASC);

CREATE TABLE IF NOT EXISTS bids (
  id            text PRIMARY KEY,
  listing_id    text REFERENCES listings(id) ON DELETE SET NULL,
  url_key       text NOT NULL,
  url           text NOT NULL,
  host          text NOT NULL,
  label         text NOT NULL,
  title         text NOT NULL DEFAULT '',
  description   text NOT NULL DEFAULT '',
  target_total  integer NOT NULL CHECK (target_total > 0),
  charge_cents  integer NOT NULL CHECK (charge_cents > 0),
  applied_delta integer,
  status        text NOT NULL DEFAULT 'pending',
  provider      text NOT NULL DEFAULT 'dodo',
  session_id    text,
  payment_id    text,
  rank_after    integer,
  created_at    timestamptz NOT NULL DEFAULT now(),
  settled_at    timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS bids_payment_id_idx ON bids (payment_id) WHERE payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS bids_activity_idx ON bids (settled_at DESC) WHERE status = 'paid';

CREATE TABLE IF NOT EXISTS clicks (
  id         bigserial PRIMARY KEY,
  listing_id text NOT NULL,
  at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clicks_at_idx ON clicks (at DESC);
