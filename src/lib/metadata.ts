const MAX_HTML = 250_000;

function decode(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    // No long dashes anywhere on the board, including scraped copy.
    .replace(/\s*[—–]\s*/g, " - ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Best effort scrape of a site's own title and description so a new listing
 * reads like the real thing. Any failure just leaves the fields empty.
 */
export async function fetchSiteMeta(url: string): Promise<{ title: string; description: string }> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; rankr-bot/1.0; +https://rankr.lol)",
        accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return { title: "", description: "" };

    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("html")) return { title: "", description: "" };

    const html = (await res.text()).slice(0, MAX_HTML);
    const pick = (re: RegExp) => html.match(re)?.[1]?.trim() ?? "";

    const title =
      pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
      pick(/<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i) ||
      pick(/<title[^>]*>([\s\S]*?)<\/title>/i);

    const description =
      pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ||
      pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i);

    return { title: decode(title).slice(0, 120), description: decode(description).slice(0, 220) };
  } catch {
    return { title: "", description: "" };
  }
}
