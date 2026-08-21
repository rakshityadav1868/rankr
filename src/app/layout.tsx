import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { siteUrl } from "@/lib/payments";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: "rankr.lol · bigger bid, better position",
  description:
    "One public leaderboard for websites. No judges, no votes, no secret sauce. Your place is your lifetime total and anyone can pay a dollar more to take it.",
  openGraph: {
    title: "rankr.lol · bigger bid, better position",
    description: "A public leaderboard for websites. Your place is your lifetime total.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "rankr.lol · bigger bid, better position",
    description: "A public leaderboard for websites. Your place is your lifetime total.",
  },
  icons: {
    icon: [{ url: "/favicon.ico" }, { url: "/icon.png", type: "image/png", sizes: "512x512" }],
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
