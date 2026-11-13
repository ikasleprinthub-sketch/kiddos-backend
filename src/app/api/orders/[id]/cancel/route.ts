import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cancelOrder } from "@/lib/orders";

// Customers may cancel only before the order is being prepared
const CUSTOMER_CANCELLABLE = ["PENDING", "CONFIRMED"] as const;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ message: "Authentication required" }, { status: 401 });

  const { id } = await params;
  const current = await prisma.order.findFirst({ where: { id, userId: user.id }, select: { status: true, paymentStatus: true } });
  if (!current) return NextResponse.json({ message: "Order not found" }, { status: 404 });
  if (current.status === "REFUNDED" && current.paymentStatus === "REFUNDED") {
    const order = await loadOrder(id);
    return NextResponse.json({ order, message: "Order is already cancelled and the refund was initiated" });
  }

  const result = await cancelOrder(id, { userId: user.id, allowed: CUSTOMER_CANCELLABLE });
  if (!result.ok) return NextResponse.json({ message: result.message }, { status: result.status });

  const order = await loadOrder(id);
  return NextResponse.json({
    order,
    refundId: result.refundId,
    refundStatus: result.refundStatus,
    message: result.refundId
      ? "Order cancelled and refund initiated to the original payment method"
      : "Order cancelled",
  });
}

function loadOrder(id: string) {
  return prisma.order.findUnique({
    where: { id },
    include: {
      items: { include: { product: { select: { id: true, name: true, images: { where: { isPrimary: true }, take: 1 } } } } },
      coupon: { select: { code: true } },
    },
  });
}
