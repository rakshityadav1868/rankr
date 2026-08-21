import type { Metadata } from "next";
import PageShell, { Rule } from "@/components/PageShell";

export const metadata: Metadata = {
  title: "About · rankr.lol",
  description: "One public leaderboard where the ranking is a number you control.",
};

export default function AboutPage() {
  return (
    <PageShell
      title="About"
      lead="Every other ranking is a black box. This one is a single number you control."
    >
      <Rule heading="Why it exists">
        <p>
          Search results, app stores, and feeds all rank you with rules nobody explains. Here the
          rule is one line long: the biggest lifetime total sits at the top until someone pays
          more.
        </p>
      </Rule>

      <Rule heading="What you get">
        <p>
          A permanent row with your title, your description, and your own link. Every outbound
          click is counted and printed next to your total, so anyone can work out exactly what a
          dollar bought.
        </p>
      </Rule>

      <Rule heading="How to climb">
        <p>
          Put in any amount you like. Bidding one dollar more than the site above you takes its
          place, and if you are already listed you pay only the difference.
        </p>
      </Rule>
    </PageShell>
  );
}
