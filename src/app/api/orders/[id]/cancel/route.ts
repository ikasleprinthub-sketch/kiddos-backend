import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { razorpay } from "@/lib/razorpay";

const CANCELLABLE_STATUSES = ["PENDING", "CONFIRMED"] as const;

function errorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const candidate = error as { error?: { description?: string }; message?: string };
    return candidate.error?.description || candidate.message || "Refund could not be initiated";
  }
  return "Refund could not be initiated";
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ message: "Authentication required" }, { status: 401 });

  const { id } = await params;
  const order = await prisma.order.findFirst({
    where: { id, userId: user.id },
    include: { items: true },
  });
  if (!order) return NextResponse.json({ message: "Order not found" }, { status: 404 });

  if (order.status === "REFUNDED" && order.paymentStatus === "REFUNDED") {
    return NextResponse.json({ order, message: "Order is already cancelled and the refund was initiated" });
  }
  if (!CANCELLABLE_STATUSES.includes(order.status as (typeof CANCELLABLE_STATUSES)[number])) {
    return NextResponse.json({ message: "This order can no longer be cancelled" }, { status: 409 });
  }
  if (order.paymentMethod !== "RAZORPAY" || order.paymentStatus !== "PAID" || !order.razorpayPaymentId) {
    return NextResponse.json({ message: "Only successfully paid online orders can be refunded automatically" }, { status: 409 });
  }

  // Claim this order before contacting Razorpay. Only one concurrent request can win.
  const claimed = await prisma.order.updateMany({
    where: { id: order.id, userId: user.id, status: order.status, paymentStatus: "PAID" },
    data: { status: "REFUNDED", refundStatus: "PROCESSING" },
  });
  if (claimed.count !== 1) {
    return NextResponse.json({ message: "Cancellation is already being processed" }, { status: 409 });
  }

  const refundAmount = Math.round(Number(order.total) * 100);
  try {
    // A minimal amount-only payload works across Razorpay payment methods. Reuse an
    // accepted full refund if a prior request reached Razorpay but lost its response.
    const prior = await razorpay.payments.fetchMultipleRefund(order.razorpayPaymentId, { count: 100 });
    let refund = prior.items.find((item) => item.amount === refundAmount && item.status !== "failed");
    if (!refund) {
      refund = await razorpay.payments.refund(order.razorpayPaymentId, { amount: refundAmount });
    }
    if (refund.status === "failed") throw new Error("Razorpay rejected the refund request");

    const updated = await prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        if (item.variantId) {
          await tx.productVariant.update({ where: { id: item.variantId }, data: { stock: { increment: item.quantity } } });
        } else {
          await tx.product.update({ where: { id: item.productId }, data: { stock: { increment: item.quantity } } });
        }
      }
      if (order.couponId) {
        await tx.coupon.updateMany({ where: { id: order.couponId, usedCount: { gt: 0 } }, data: { usedCount: { decrement: 1 } } });
      }
      return tx.order.update({
        where: { id: order.id },
        data: { status: "REFUNDED", paymentStatus: "REFUNDED", razorpayRefundId: refund.id, refundStatus: refund.status.toUpperCase() },
        include: { items: { include: { product: { select: { id: true, name: true, images: { where: { isPrimary: true }, take: 1 } } } } }, coupon: { select: { code: true } } },
      });
    });

    return NextResponse.json({ order: updated, refundId: refund.id, refundStatus: refund.status, message: "Order cancelled and refund initiated to the original payment method" });
  } catch (error) {
    await prisma.order.updateMany({
      where: { id: order.id, status: "REFUNDED", paymentStatus: "PAID", refundStatus: "PROCESSING" },
      data: { status: order.status, refundStatus: "FAILED" },
    });
    console.error("Customer cancellation refund failed:", error);
    return NextResponse.json({ message: errorMessage(error) }, { status: 502 });
  }
}
