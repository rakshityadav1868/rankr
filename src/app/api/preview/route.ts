import { NextResponse } from "next/server";
import { normalizeTarget, quoteFor } from "@/lib/board";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const target = normalizeTarget(new URL(req.url).searchParams.get("url"));
  if (!target) return NextResponse.json({ valid: false });

  try {
    const quote = await quoteFor(target);
    return NextResponse.json({ valid: true, ...quote }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("preview failed", err);
    return NextResponse.json({ valid: false }, { status: 503 });
  }
}
