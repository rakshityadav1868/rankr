import DodoPayments from "dodopayments";

export type DodoConfig = {
  apiKey: string;
  productId: string;
  /** Optional. Without it the site settles bids by asking Dodo directly. */
  webhookKey: string | null;
  environment: "live_mode" | "test_mode";
};

/** Reads the Dodo settings, or null when the keys are not in place yet. */
export function dodoConfig(): DodoConfig | null {
  const apiKey = process.env.DODO_API_KEY;
  const productId = process.env.DODO_PRODUCT_ID;
  if (!apiKey || !productId) return null;
  return {
    apiKey,
    productId,
    webhookKey: process.env.DODO_WEBHOOK_KEY || null,
    environment: process.env.DODO_ENV === "test" ? "test_mode" : "live_mode",
  };
}

export const paymentsConfigured = () => dodoConfig() !== null;
export const webhooksConfigured = () => Boolean(dodoConfig()?.webhookKey);

/**
 * Bids may only skip payment on a developer machine, and only when it is asked
 * for explicitly. Production always charges.
 */
export const allowUnpaidBids =
  process.env.NODE_ENV !== "production" && process.env.ALLOW_UNPAID_BIDS === "true";

function client(config: DodoConfig) {
  return new DodoPayments({
    bearerToken: config.apiKey,
    environment: config.environment,
    webhookKey: config.webhookKey ?? undefined,
    maxRetries: 2,
  });
}

export function siteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000");
  return raw.replace(/\/+$/, "");
}

/**
 * Opens a Dodo checkout for one bid. The amount is the gap the bidder owes, in
 * cents, and the bid id travels in metadata so the webhook can settle it.
 */
export async function createCheckout(args: {
  bidId: string;
  chargeCents: number;
  label: string;
}): Promise<{ checkoutUrl: string; sessionId: string }> {
  const config = dodoConfig();
  if (!config) throw new Error("Dodo Payments is not configured");

  const session = await client(config).checkoutSessions.create({
    product_cart: [{ product_id: config.productId, quantity: 1, amount: args.chargeCents }],
    return_url: `${siteUrl()}/?bid=${args.bidId}`,
    metadata: { bid_id: args.bidId, listing: args.label },
  });

  if (!session.checkout_url) throw new Error("Dodo did not return a checkout url");
  return { checkoutUrl: session.checkout_url, sessionId: session.session_id };
}

export type PaymentCheck =
  | { state: "pending" }
  | { state: "paid"; paymentId: string; amountCents: number }
  | { state: "failed" };

/**
 * Asks Dodo what happened to a checkout session. This is what lets the board
 * settle bids without a webhook: the answer comes from Dodo, never from the
 * browser that came back from checkout.
 */
export async function checkSession(sessionId: string): Promise<PaymentCheck> {
  const config = dodoConfig();
  if (!config) throw new Error("Dodo Payments is not configured");
  const dodo = client(config);

  const session = (await dodo.checkoutSessions.retrieve(sessionId)) as {
    payment_id?: string | null;
    payment_status?: string | null;
  };

  const status = (session.payment_status ?? "").toLowerCase();
  if (!session.payment_id) {
    return status === "failed" || status === "cancelled" ? { state: "failed" } : { state: "pending" };
  }

  // Confirm against the payment itself so the amount can be checked too.
  const payment = (await dodo.payments.retrieve(session.payment_id)) as {
    status?: string | null;
    total_amount?: number | null;
  };
  const paymentStatus = (payment.status ?? status).toLowerCase();

  if (paymentStatus === "succeeded")
    return {
      state: "paid",
      paymentId: session.payment_id,
      amountCents: payment.total_amount ?? 0,
    };
  if (["failed", "cancelled", "canceled", "expired"].includes(paymentStatus)) return { state: "failed" };
  return { state: "pending" };
}

export type DodoEvent = {
  type: string;
  data?: { payment_id?: string; metadata?: Record<string, string>; status?: string };
};

/**
 * Verifies the Standard Webhooks signature and returns the event. Throws when
 * the signature does not check out, so unsigned calls can never move the board.
 */
export function verifyWebhook(rawBody: string, headers: Headers): DodoEvent {
  const config = dodoConfig();
  if (!config?.webhookKey) throw new Error("Webhook key is not configured");

  return client(config).webhooks.unwrap(rawBody, {
    headers: {
      "webhook-id": headers.get("webhook-id") ?? "",
      "webhook-signature": headers.get("webhook-signature") ?? "",
      "webhook-timestamp": headers.get("webhook-timestamp") ?? "",
    },
  }) as DodoEvent;
}
