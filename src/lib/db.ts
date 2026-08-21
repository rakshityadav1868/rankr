import postgres from "postgres";

declare global {
   
  var __rankrSql: ReturnType<typeof postgres> | undefined;
   
  var __rankrSchema: Promise<void> | undefined;
}

function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Paste your Supabase connection string into .env.local (see .env.example)."
    );
  }
  return postgres(url, {
    // Supabase's transaction pooler (port 6543) does not support prepared statements.
    prepare: false,
    ssl: url.includes("localhost") || url.includes("127.0.0.1") ? false : "require",
    max: 5,
    idle_timeout: 20,
    connect_timeout: 15,
    transform: { undefined: null },
  });
}

function client() {
  globalThis.__rankrSql ??= connect();
  return globalThis.__rankrSql;
}

/**
 * Lazy handle: the connection is only opened on the first query, so builds and
 * cold starts never need the database to be reachable up front.
 */
export const sql = new Proxy(function () {} as unknown as ReturnType<typeof postgres>, {
  apply: (_target, _thisArg, args: Parameters<ReturnType<typeof postgres>>) =>
    (client() as (...a: typeof args) => unknown)(...args),
  get: (_target, prop: string) => (client() as unknown as Record<string, unknown>)[prop],
}) as ReturnType<typeof postgres>;

/**
 * Creates the schema if it is missing. Safe to call on every request: it runs
 * once per process and every statement is idempotent.
 */
export function ensureSchema(): Promise<void> {
  globalThis.__rankrSchema ??= (async () => {
    try {
      // One advisory lock so several cold-starting instances cannot run the
      // same DDL at the same moment.
      await sql.begin(async (tx) => {
        await tx`SELECT pg_advisory_xact_lock(4021958713)`;
        await tx`
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
          )
        `;
        await tx`CREATE INDEX IF NOT EXISTS listings_rank_idx ON listings (amount DESC, updated_at ASC)`;
        await tx`
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
          )
        `;
        await tx`CREATE UNIQUE INDEX IF NOT EXISTS bids_payment_id_idx ON bids (payment_id) WHERE payment_id IS NOT NULL`;
        await tx`CREATE INDEX IF NOT EXISTS bids_activity_idx ON bids (settled_at DESC) WHERE status = 'paid'`;
        await tx`
          CREATE TABLE IF NOT EXISTS clicks (
            id         bigserial PRIMARY KEY,
            listing_id text NOT NULL,
            at         timestamptz NOT NULL DEFAULT now()
          )
        `;
        await tx`CREATE INDEX IF NOT EXISTS clicks_at_idx ON clicks (at DESC)`;
      });
    } catch (err) {
      // Another instance may have won the race. If the tables are there, carry on.
      const [{ ok }] = await sql<{ ok: boolean }[]>`
        SELECT to_regclass('public.listings') IS NOT NULL
           AND to_regclass('public.bids') IS NOT NULL
           AND to_regclass('public.clicks') IS NOT NULL AS ok
      `;
      if (!ok) throw err;
    }
  })().catch((err) => {
    globalThis.__rankrSchema = undefined;
    throw err;
  });
  return globalThis.__rankrSchema;
}
