import { NextResponse } from "next/server";
import { normalizeTarget, parseAmount, quoteFor } from "@/lib/board";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const target = normalizeTarget(params.get("url"));
  if (!target) return NextResponse.json({ valid: false });

  const raw = params.get("amount");
  const amount = raw === null ? null : parseAmount(raw);

  try {
    const quote = await quoteFor(target, amount);
    return NextResponse.json({ valid: true, ...quote }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("preview failed", err);
    return NextResponse.json({ valid: false }, { status: 503 });
  }
}
