import { NextRequest, NextResponse } from "next/server";
import { hmacSha256Hex, safeEqualHex } from "@/lib/checkout";
import { finalizePaidCheckout } from "@/lib/orders";

/**
 * Razorpay webhook (server-to-server). Saves the order even when the customer's browser never reaches
 * /api/payment/verify — e.g. they closed the tab or lost connection right after paying.
 *
 * Setup (Razorpay Dashboard → Settings → Webhooks):
 *   URL:    https://<your-site>/api/payment/webhook
 *   Secret: the same value as RAZORPAY_WEBHOOK_SECRET in .env
 *   Events: payment.captured, order.paid
 *
 * finalizePaidCheckout is idempotent, so it doesn't matter whether this or /verify runs first, or if
 * Razorpay delivers the same event more than once.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[payment/webhook] RAZORPAY_WEBHOOK_SECRET is not set; ignoring webhook");
    return NextResponse.json({ message: "Webhook not configured" }, { status: 503 });
  }

  // The signature covers the exact raw body, so read it as text before parsing
  const raw = await request.text();
  const signature = request.headers.get("x-razorpay-signature");
  if (!safeEqualHex(hmacSha256Hex(secret, raw), signature)) {
    return NextResponse.json({ message: "Invalid signature" }, { status: 400 });
  }

  let event: {
    event?: string;
    payload?: { payment?: { entity?: { id?: string; order_id?: string; status?: string } } };
  };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ message: "Invalid payload" }, { status: 400 });
  }

  if (event.event !== "payment.captured" && event.event !== "order.paid") {
    return NextResponse.json({ ok: true, ignored: event.event ?? "unknown" });
  }

  const payment = event.payload?.payment?.entity;
  if (!payment?.id || !payment.order_id || payment.status !== "captured") {
    return NextResponse.json({ ok: true, ignored: "payment not captured" });
  }

  try {
    const result = await finalizePaidCheckout(payment.order_id, payment.id);
    if (result.kind === "not_found") {
      // Not one of our checkouts (or created before pending checkouts existed): nothing to do
      console.warn(`[payment/webhook] no checkout for Razorpay order ${payment.order_id} (payment ${payment.id})`);
      return NextResponse.json({ ok: true, ignored: "unknown order" });
    }
    return NextResponse.json({ ok: true, order: result.order.orderNumber, result: result.kind });
  } catch (error) {
    // A non-2xx answer makes Razorpay retry later
    console.error(`[payment/webhook] failed for payment ${payment.id}:`, (error as Error).message);
    return NextResponse.json({ message: "Temporary failure" }, { status: 500 });
  }
}
