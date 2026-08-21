import { NextResponse } from "next/server";
import { verifyAndSettle } from "@/lib/settlement";

export const dynamic = "force-dynamic";

/** Polled by the page after checkout. Confirms the payment with Dodo itself. */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[a-f0-9]{24}$/.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const result = await verifyAndSettle(id);
    if (result.status === "unknown") return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("bid status failed", err);
    return NextResponse.json({ status: "pending" }, { headers: { "cache-control": "no-store" } });
  }
}
