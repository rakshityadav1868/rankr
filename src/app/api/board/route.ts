import { NextResponse } from "next/server";
import { getBoardPage } from "@/lib/board";
import { sweepPendingBids } from "@/lib/settlement";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const page = Number(params.get("page") ?? 0);
  const pageSize = Number(params.get("pageSize") ?? 20);

  try {
    // Picks up any payment whose payer never made it back to the site.
    void sweepPendingBids();
    const board = await getBoardPage(Number.isFinite(page) ? page : 0, pageSize);
    return NextResponse.json(board, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("board failed", err);
    return NextResponse.json({ error: "Board unavailable" }, { status: 503 });
  }
}
