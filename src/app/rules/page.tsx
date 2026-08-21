import type { Metadata } from "next";
import PageShell, { Rule } from "@/components/PageShell";

export const metadata: Metadata = {
  title: "Rules · rankr.lol",
  description: "How bidding, ranking, and payment work on the board.",
};

export default function RulesPage() {
  return (
    <PageShell
      title="Rules"
      lead="Six lines, no fine print hidden anywhere else. This is the whole system."
    >
      <Rule heading="What a bid buys">
        <p>
          Your place on the board is your lifetime total in whole dollars, highest first. The
          first bid on an empty board is one dollar. After that, taking any place costs one
          dollar more than the listing sitting on it, so the top spot climbs one dollar at a
          time.
        </p>
      </Rule>

      <Rule heading="Paying the difference">
        <p>
          Already listed? You are charged only the gap between your current total and the new
          one. If you sit at four dollars and the top spot costs seven, you pay three.
        </p>
      </Rule>

      <Rule heading="Ties">
        <p>
          Two listings on the same total are split by who got there first. The earlier bid keeps
          the better place until someone pays more.
        </p>
      </Rule>

      <Rule heading="Nothing expires">
        <p>
          Your listing is permanent. Being outbid moves you down the board, it never removes you,
          and there is no monthly fee to stay listed.
        </p>
      </Rule>

      <Rule heading="Links">
        <p>
          A listing can be a website or an @handle, which resolves to that X profile. Query
          strings are stripped from every link, so affiliate, referral, and tracking URLs will
          not work here. Outbound clicks are counted and shown publicly on your row.
        </p>
      </Rule>

      <Rule heading="Money and removals">
        <p>
          Whole dollars only, and bids are non refundable. Illegal content, malware, and phishing
          get pulled from the board without a refund.
        </p>
      </Rule>
    </PageShell>
  );
}
