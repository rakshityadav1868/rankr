import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/payments";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/go/"] }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
