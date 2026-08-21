"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Listing = {
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

type ActivityItem = { id: string; label: string; host: string; amount: number; rank: number; at: number };

type BoardResponse = {
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
};

type Quote = {
  valid: boolean;
  label: string;
  currentTotal: number;
  currentRank: number | null;
  minTotal: number;
  topPrice: number;
};

const PAGE_SIZE = 15;

function money(n: number) {
  return `$${n.toLocaleString("en-US")}`;
}

/** No long dashes on the board, including titles scraped from other sites. */
function clean(text: string) {
  return text.replace(/\s*[—–]\s*/g, " - ");
}

const nowMs = () => Date.now();

function ago(ts: number) {
  const s = Math.max(1, Math.floor((nowMs() - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

function Favicon({ host, label }: { host: string; label: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accentsoft text-sm font-bold text-accent">
        {label.replace("@", "").charAt(0).toUpperCase()}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`}
      alt=""
      width={44}
      height={44}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-11 w-11 shrink-0 rounded-xl border border-line bg-white object-contain p-1"
    />
  );
}

export default function Board() {
  const [data, setData] = useState<BoardResponse | null>(null);
  const [page, setPage] = useState(0);
  const [url, setUrl] = useState("");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [status, setStatus] = useState<{ kind: "idle" | "error" | "ok" | "wait"; message: string }>({
    kind: "idle",
    message: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [offline, setOffline] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (targetPage: number) => {
    try {
      const res = await fetch(`/api/board?page=${targetPage}&pageSize=${PAGE_SIZE}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setOffline(true);
        return;
      }
      setData(await res.json());
      setOffline(false);
      setUpdatedAt(nowMs());
    } catch {
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch plus polling
    load(page);
    const t = setInterval(() => load(page), 15000);
    return () => clearInterval(t);
  }, [load, page]);

  // Coming back from Dodo checkout: wait for the webhook, then show the placement.
  useEffect(() => {
    const bidId = new URLSearchParams(window.location.search).get("bid");
    if (!bidId) return;
    window.history.replaceState({}, "", window.location.pathname);

    let tries = 0;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to the checkout return url
    setStatus({ kind: "wait", message: "Payment received. Placing your bid on the board." });

    const poll = async () => {
      if (cancelled) return;
      tries += 1;
      try {
        const res = await fetch(`/api/bid-status?id=${bidId}`, { cache: "no-store" });
        const json = await res.json();
        if (json.status === "paid") {
          setStatus({
            kind: "ok",
            message: json.rank
              ? `${json.label} is now at place #${json.rank}.`
              : `${json.label} is on the board.`,
          });
          load(0);
          return;
        }
        if (json.status === "failed" || json.status === "cancelled") {
          setStatus({ kind: "error", message: "That payment did not go through, so nothing changed." });
          return;
        }
      } catch {
        // keep waiting, the webhook may still be in flight
      }
      if (tries < 20) setTimeout(poll, 2000);
      else
        setStatus({
          kind: "wait",
          message: "Payment received. The board updates as soon as the payment clears.",
        });
    };
    poll();
    return () => {
      cancelled = true;
    };
  }, [load]);

  // Live quote for whatever is typed in the URL box.
  useEffect(() => {
    const t = setTimeout(async () => {
      if (!url.trim()) {
        setQuote(null);
        return;
      }
      try {
        const res = await fetch(`/api/preview?url=${encodeURIComponent(url)}`);
        const json = await res.json();
        setQuote(json.valid ? json : null);
      } catch {
        setQuote(null);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [url]);

  const listings = useMemo(() => data?.listings ?? [], [data]);
  const minBid = data?.minBid ?? 1;
  const topPrice = Math.max(minBid, (data?.topAmount ?? 0) + (data?.step ?? 1));
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const floor = quote?.currentTotal ? quote.currentTotal + 1 : minBid;
  const suggested = quote?.currentTotal ? quote.currentTotal + 1 : topPrice;
  const shown = amount === "" ? suggested : Number(amount);
  const validAmount = Number.isInteger(shown) && shown >= floor;
  const charge = quote?.currentTotal ? Math.max(0, shown - quote.currentTotal) : shown;

  function step(delta: number) {
    const base = Number.isFinite(shown) ? shown : floor;
    setAmount(String(Math.max(floor, Math.round(base) + delta)));
  }

  function claim(price: number) {
    setAmount(String(price));
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    document.getElementById("bid-url")?.focus();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!validAmount || submitting) return;
    setSubmitting(true);
    setStatus({ kind: "idle", message: "" });
    try {
      const res = await fetch("/api/bid", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, amount: shown }),
      });
      const json = await res.json();

      if (res.ok && json.checkoutUrl) {
        setStatus({ kind: "wait", message: "Opening checkout." });
        window.location.href = json.checkoutUrl;
        return;
      }
      if (!res.ok) {
        setStatus({ kind: "error", message: json.error ?? "That bid did not go through." });
        if (json.minTotal) setAmount(String(json.minTotal));
      } else {
        setStatus({
          kind: "ok",
          message: `You are at place #${json.rank} on ${money(json.amount)}. Charged ${money(json.charged)}.`,
        });
        setUrl("");
        setAmount("");
        setQuote(null);
        setPage(0);
        await load(0);
      }
    } catch {
      setStatus({ kind: "error", message: "Network error. Try again." });
    } finally {
      setSubmitting(false);
    }
  }

  const ticker = listings.slice(0, 12);
  const statusColor =
    status.kind === "error" ? "text-red-600" : status.kind === "ok" ? "text-good" : "text-muted";

  return (
    <div className="min-h-screen bg-page">
      <header className="sticky top-0 z-30 border-b border-line bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
          <Link href="/" className="flex items-center gap-2 text-[17px] font-bold tracking-tight">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-[13px] font-black text-white">
              $
            </span>
            rankr<span className="text-accent">.lol</span>
          </Link>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-3 rounded-full border border-line bg-white px-4 py-1.5 text-[13px] sm:flex">
              <span className="flex items-center gap-1.5">
                <span className="dot h-1.5 w-1.5 rounded-full bg-good" />
                <b className="tabular">{total}</b> <span className="text-muted">listed</span>
              </span>
              <span className="h-3 w-px bg-line" />
              <span>
                <b className="tabular">{money(data?.pot ?? 0)}</b> <span className="text-muted">pot</span>
              </span>
              <span className="h-3 w-px bg-line" />
              <span>
                <b className="tabular">{(data?.clicks24h ?? 0).toLocaleString()}</b>{" "}
                <span className="text-muted">clicks / 24h</span>
              </span>
            </div>
            <a
              href="#bid"
              className="rounded-xl bg-accent px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110"
            >
              Bid
            </a>
          </div>
        </div>
      </header>

      <div className="overflow-hidden border-b border-line bg-white">
        <div className="marquee flex w-max gap-7 py-2.5 text-[13px]">
          {ticker.length > 0 &&
            [...ticker, ...ticker].map((l, i) => (
              <span key={`${l.id}-${i}`} className="flex shrink-0 items-center gap-2">
                <span className="tabular text-accent">#{l.rank}</span>
                <span className="font-medium">{clean(l.title || l.label)}</span>
                <span className="tabular text-muted">{money(l.amount)}</span>
                <span className="text-line">•</span>
              </span>
            ))}
          {ticker.length === 0 && (
            <span className="px-6 text-muted">no bids yet, the board is wide open</span>
          )}
        </div>
      </div>

      <main className="mx-auto grid max-w-6xl gap-8 px-5 py-12 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <h1 className="text-[44px] font-extrabold leading-[1.03] tracking-tight">
            Outbid them.
            <br />
            <span className="text-muted">Own the top spot.</span>
          </h1>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted">
            No voting, no curation, no gatekeepers. Whoever pays the most sits at the top, plain and
            simple, until the next bid knocks them down.
          </p>

          <div ref={cardRef} id="bid" className="mt-7 rounded-2xl border border-line bg-card p-4 shadow-sm">
            <form onSubmit={submit} className="space-y-3">
              <div className="flex items-center gap-2 rounded-xl border border-line bg-page px-4 py-3 focus-within:border-accent">
                <span aria-hidden className="text-muted">
                  🌐
                </span>
                <input
                  id="bid-url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="yourproduct.com"
                  autoComplete="url"
                  spellCheck={false}
                  maxLength={300}
                  className="w-full bg-transparent text-[15px] outline-none placeholder:text-muted/70"
                />
              </div>

              <div className="flex items-center justify-between rounded-xl border border-line bg-page px-2 py-2">
                <button
                  type="button"
                  onClick={() => step(-1)}
                  disabled={shown <= floor}
                  className="h-10 w-11 rounded-lg border border-line bg-white text-lg text-muted transition hover:text-ink disabled:opacity-40"
                  aria-label="Lower the bid"
                >
                  −
                </button>
                <div className="flex flex-1 items-center justify-center">
                  <span className="text-3xl font-bold">$</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={floor}
                    step={1}
                    value={amount === "" ? String(suggested) : amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
                    style={{ width: `${String(amount === "" ? suggested : amount || 1).length + 0.5}ch` }}
                    className="bg-transparent text-center text-3xl font-bold tabular outline-none"
                    aria-label="Bid amount in dollars"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => step(1)}
                  className="h-10 w-11 rounded-lg border border-line bg-white text-lg text-muted transition hover:text-ink"
                  aria-label="Raise the bid"
                >
                  +
                </button>
              </div>

              <button
                type="submit"
                disabled={submitting || !url.trim() || !validAmount || offline}
                className="h-12 w-full rounded-xl bg-accent text-[15px] font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submitting ? "Opening checkout" : `Bid ${money(Number.isFinite(charge) ? charge : 0)}`}
              </button>
            </form>

            <div className="mt-3 space-y-1 px-1 text-[13px] text-muted">
              {quote?.currentRank ? (
                <p>
                  <b className="text-ink">{quote.label}</b> already sits at{" "}
                  <b className="tabular text-ink">{money(quote.currentTotal)}</b> in place #
                  {quote.currentRank}. You pay only the difference, so this costs{" "}
                  <b className="tabular text-accent">{money(charge)}</b>.
                </p>
              ) : total === 0 ? (
                <p>The board is empty, so {money(minBid)} makes you number one.</p>
              ) : (
                <p>
                  {money(topPrice)} takes the top spot right now. Any place costs one dollar more
                  than the site sitting on it.
                </p>
              )}
              {!validAmount && (
                <p className="text-red-600">The smallest bid you can place here is {money(floor)}.</p>
              )}
              {status.kind !== "idle" && <p className={statusColor}>{status.message}</p>}
              {offline && (
                <p className="text-red-600">
                  The board cannot be reached right now. Refresh in a moment.
                </p>
              )}
            </div>
          </div>

          <p className="mt-3 px-1 text-[12px] text-muted">
            Whole dollars, non refundable. Someone can outbid you at any time and your listing still
            stays on the board.{" "}
            <Link href="/rules" className="text-accent hover:underline">
              Read the rules
            </Link>
          </p>

          {(data?.activity.length ?? 0) > 0 && (
            <div className="mt-6 rounded-2xl border border-line bg-card p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold">Latest bids</h2>
              <ul className="space-y-2 text-[13px]">
                {data?.activity.slice(0, 6).map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3">
                    <span className="truncate">
                      <b>{a.label}</b> <span className="text-muted">at place #{a.rank}</span>
                    </span>
                    <span className="shrink-0 text-muted">{ago(a.at)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <button
              onClick={() => load(page)}
              className="flex items-center gap-2 rounded-xl border border-line bg-card px-4 py-2 text-sm font-medium shadow-sm transition hover:border-accent hover:text-accent"
            >
              <span aria-hidden>↻</span> Refresh
            </button>
            <p className="text-[13px] tabular text-muted">
              {total} listing{total === 1 ? "" : "s"} · {money(data?.pot ?? 0)} pot · updated{" "}
              {updatedAt ? ago(updatedAt) : "just now"}
            </p>
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="h-8 w-8 rounded-full text-muted transition hover:text-ink disabled:opacity-30"
                aria-label="Previous page"
              >
                ‹
              </button>
              <span className="grid h-8 min-w-8 place-items-center rounded-full bg-accent px-2 text-sm font-semibold tabular text-white">
                {page + 1}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={page >= pageCount - 1}
                className="h-8 w-8 rounded-full text-muted transition hover:text-ink disabled:opacity-30"
                aria-label="Next page"
              >
                ›
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-card p-2 shadow-sm">
            {listings.length === 0 && (
              <div className="rounded-xl border border-dashed border-line p-12 text-center text-muted">
                {offline
                  ? "The board is taking a moment to answer."
                  : `Nobody has bid yet. ${money(minBid)} makes you number one.`}
              </div>
            )}

            <ol>
              {listings.map((l) => {
                const price = l.amount + 1;
                const podium = l.rank <= 3;
                return (
                  <li
                    key={l.id}
                    className={`group flex items-start gap-4 rounded-xl p-4 transition ${
                      podium ? "bg-tint" : "hover:bg-page"
                    }`}
                  >
                    <div
                      className={`mt-1 shrink-0 rounded-lg px-2 py-1 text-[13px] font-bold tabular ${
                        podium ? "bg-accentsoft text-accent" : "text-muted"
                      }`}
                    >
                      #{l.rank}
                    </div>

                    <Favicon host={l.host} label={l.label} />

                    <div className="min-w-0 flex-1">
                      <a
                        href={`/go/${l.id}`}
                        target="_blank"
                        rel="noreferrer sponsored"
                        className="block truncate text-[15px] font-semibold hover:text-accent"
                      >
                        {clean(l.title || l.label)}
                      </a>
                      {l.description && (
                        <p className="mt-0.5 line-clamp-2 text-[14px] leading-snug text-muted">
                          {clean(l.description)}
                        </p>
                      )}
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 text-[13px] tabular text-muted">
                        <span>{ago(l.updatedAt)}</span>
                        <span className="flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-good" />
                          {l.clicks} click{l.clicks === 1 ? "" : "s"}
                        </span>
                        {l.clicks > 0 && <span>${(l.amount / l.clicks).toFixed(2)} per click</span>}
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <div className={`text-2xl font-bold tabular ${podium ? "text-accent" : ""}`}>
                        {money(l.amount)}
                      </div>
                      <button
                        onClick={() => claim(price)}
                        className="mt-1 rounded-lg border border-line bg-white px-2.5 py-1 text-[11px] text-muted transition hover:border-accent hover:text-accent lg:opacity-0 lg:group-hover:opacity-100"
                      >
                        take this place for {money(price)}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

          {pageCount > 1 && (
            <div className="mt-5 flex flex-wrap items-center justify-center gap-1">
              {Array.from({ length: pageCount }).slice(0, 12).map((_, i) => (
                <button
                  key={i}
                  onClick={() => setPage(i)}
                  className={`h-8 min-w-8 rounded-lg border px-2 text-sm tabular ${
                    i === page
                      ? "border-accent bg-accent text-white"
                      : "border-line bg-card text-muted hover:text-ink"
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          )}
        </div>
      </main>

      <footer className="mt-8 border-t border-line bg-white">
        <div className="mx-auto max-w-6xl px-5 py-8">
          <div className="flex flex-wrap items-center justify-between gap-4 text-sm">
            <span className="font-bold">rankr</span>
            <nav className="flex flex-wrap items-center gap-6 text-muted">
              <Link href="/rules" className="hover:text-ink">
                Rules
              </Link>
              <Link href="/about" className="hover:text-ink">
                About
              </Link>
              <span>Payments by Dodo</span>
            </nav>
          </div>
          <p className="mt-5 text-[13px] text-muted">
            Query strings are stripped from every listing link, so affiliate, referral, and tracking
            URLs will not work here.
          </p>
        </div>
      </footer>
    </div>
  );
}
