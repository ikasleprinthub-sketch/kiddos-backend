import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hmacSha256Hex, safeEqualHex } from "@/lib/checkout";
import { finalizePaidCheckout } from "@/lib/orders";

function orderResponse(order: { id: string; orderNumber: string; status: string; paymentStatus: string; total: unknown; createdAt: Date }, razorpayPaymentId: string) {
  return NextResponse.json({
    success: true,
    order: {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      total: order.total,
      createdAt: order.createdAt,
    },
    razorpayPaymentId,
  });
}

/**
 * Called by the checkout page after Razorpay reports a successful payment.
 *
 * Only the payment identifiers are read from the request. The order itself (items, prices, totals,
 * coupon, address) comes from the cart the server priced in /api/payment/create-order. The Razorpay
 * webhook (/api/payment/webhook) runs the same step, so the order is saved even if this call never arrives.
 */
export async function POST(request: NextRequest) {
  try {
    return await verifyPayment(request);
  } catch (error) {
    // Always answer with JSON so the checkout page can show a message instead of failing to parse an empty 500
    console.error("[payment/verify]", (error as { code?: string }).code ?? "", (error as Error).message);
    return NextResponse.json(
      {
        message: "Could not record your order. If money was deducted, please contact support.",
        ...(process.env.NODE_ENV !== "production" && { detail: (error as Error).message }),
      },
      { status: 500 }
    );
  }
}

async function verifyPayment(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ message: "Authentication required" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
  }
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = body as Record<string, unknown>;

  if (
    typeof razorpayOrderId !== "string" || !razorpayOrderId ||
    typeof razorpayPaymentId !== "string" || !razorpayPaymentId ||
    typeof razorpaySignature !== "string" || !razorpaySignature
  ) {
    return NextResponse.json({ message: "Missing payment verification data" }, { status: 400 });
  }

  // Signature proves Razorpay confirmed this payment for this Razorpay order
  const expectedSignature = hmacSha256Hex(process.env.RAZORPAY_KEY_SECRET!, `${razorpayOrderId}|${razorpayPaymentId}`);
  if (!safeEqualHex(expectedSignature, razorpaySignature)) {
    return NextResponse.json({ message: "Payment verification failed: invalid signature" }, { status: 400 });
  }

  // Ownership: the checkout must belong to the signed-in user, so one user can't claim another's payment
  const pending = await prisma.pendingCheckout.findUnique({ where: { razorpayOrderId }, select: { userId: true } });
  if (pending && pending.userId !== user.id) {
    return NextResponse.json({ message: "This payment does not belong to your account" }, { status: 403 });
  }

  const result = await finalizePaidCheckout(razorpayOrderId, razorpayPaymentId);

  if (result.kind === "not_found") {
    console.error(`[payment/verify] no checkout found for Razorpay order ${razorpayOrderId} (payment ${razorpayPaymentId})`);
    return NextResponse.json(
      { message: `We could not find this checkout. If money was deducted, contact support with payment ID ${razorpayPaymentId}.` },
      { status: 400 }
    );
  }
  if (result.order.userId !== user.id) {
    return NextResponse.json({ message: "This payment does not belong to your account" }, { status: 403 });
  }
  if (result.kind === "refunded") {
    // Paid, but an item sold out meanwhile: the payment was refunded in full
    return NextResponse.json(
      {
        refunded: true,
        message: result.reason.replace(/^Automatically refunded:\s*/, ""),
        order: { id: result.order.id, orderNumber: result.order.orderNumber, status: result.order.status },
        razorpayPaymentId,
      },
      { status: 409 }
    );
  }
  return orderResponse(result.order, razorpayPaymentId);
}
