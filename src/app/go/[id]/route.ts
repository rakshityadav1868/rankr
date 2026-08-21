import { NextResponse } from "next/server";
import { registerClick } from "@/lib/board";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  try {
    const url = await registerClick(id);
    if (url) {
      const out = new URL(url);
      out.searchParams.set("utm_source", "rankr");
      return NextResponse.redirect(out.toString(), 302);
    }
  } catch (err) {
    console.error("click failed", err);
  }
  return NextResponse.redirect(new URL("/", req.url), 302);
}
