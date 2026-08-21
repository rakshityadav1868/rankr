import Link from "next/link";

export default function PageShell({
  title,
  lead,
  children,
}: {
  title: string;
  lead: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-page">
      <header className="sticky top-0 z-30 border-b border-line bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-3">
          <Link href="/" className="flex items-center gap-2 text-[17px] font-bold tracking-tight">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-[13px] font-black text-white">
              $
            </span>
            rankr<span className="text-accent">.lol</span>
          </Link>
          <Link
            href="/"
            className="rounded-xl bg-accent px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110"
          >
            Back to the board
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-14">
        <h1 className="text-4xl font-extrabold tracking-tight">{title}</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">{lead}</p>
        <div className="mt-10 space-y-8">{children}</div>
      </main>

      <footer className="mt-8 border-t border-line bg-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm">
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
      </footer>
    </div>
  );
}

export function Rule({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-card p-6 shadow-sm">
      <h2 className="mb-2 text-lg font-bold">{heading}</h2>
      <div className="space-y-2 text-[15px] leading-relaxed text-muted">{children}</div>
    </section>
  );
}
