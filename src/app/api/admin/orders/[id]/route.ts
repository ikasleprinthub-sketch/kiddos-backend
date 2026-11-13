import { NextRequest, NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cancelOrder } from "@/lib/orders";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await authorizeAdmin(request);
  if (!admin) return NextResponse.json({ message: "Access denied: Admins only" }, { status: 403 });

  const { id } = await params;
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true } },
      items: {
        include: {
          product: {
            select: {
              id: true, name: true, sku: true,
              images: { where: { isPrimary: true }, take: 1 },
            },
          },
        },
      },
      coupon: true,
    },
  });

  if (!order) return NextResponse.json({ message: "Order not found" }, { status: 404 });

  return NextResponse.json({ order });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await authorizeAdmin(request);
  if (!admin) return NextResponse.json({ message: "Access denied: Admins only" }, { status: 403 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ message: "Invalid request" }, { status: 400 });
  const { status, paymentStatus, notes } = body as { status?: unknown; paymentStatus?: unknown; notes?: unknown };

  if (status !== undefined && !ORDER_STATUSES.includes(status as OrderStatusValue)) {
    return NextResponse.json({ message: "Invalid order status" }, { status: 400 });
  }
  if (paymentStatus !== undefined && !PAYMENT_STATUSES.includes(paymentStatus as (typeof PAYMENT_STATUSES)[number])) {
    return NextResponse.json({ message: "Invalid payment status" }, { status: 400 });
  }
  if (notes !== undefined && notes !== null && (typeof notes !== "string" || notes.length > 2000)) {
    return NextResponse.json({ message: "Notes must be text of at most 2000 characters" }, { status: 400 });
  }

  const existing = await prisma.order.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ message: "Order not found" }, { status: 404 });

  // Cancelling always goes through the shared flow: refund (when paid online), restock, release coupon
  if (status === "CANCELLED" && existing.status !== "CANCELLED") {
    const result = await cancelOrder(id, { allowed: ADMIN_CANCELLABLE });
    if (!result.ok) return NextResponse.json({ message: result.message }, { status: result.status });
    return NextResponse.json({ order: await loadOrder(id), refundId: result.refundId });
  }

  const isPaidOnline = existing.paymentMethod === "RAZORPAY" && existing.paymentStatus === "PAID";
  if (isPaidOnline) {
    // The payment is confirmed by Razorpay, so its status can't be edited by hand, and fulfilment only
    // moves forward (Confirmed → Processing → Shipped → Delivered). Refunds happen by cancelling.
    if (paymentStatus !== undefined && paymentStatus !== existing.paymentStatus) {
      return NextResponse.json({ message: "Payment status is locked for online-paid orders" }, { status: 409 });
    }
    if (status !== undefined && status !== existing.status) {
      const from = FULFILMENT_FLOW.indexOf(existing.status as (typeof FULFILMENT_FLOW)[number]);
      const to = FULFILMENT_FLOW.indexOf(status as (typeof FULFILMENT_FLOW)[number]);
      if (from === -1 || to === -1 || to < from) {
        return NextResponse.json(
          { message: "Paid orders can only move forward (Confirmed → Processing → Shipped → Delivered) or be cancelled" },
          { status: 409 }
        );
      }
    }
  }

  const updateData: Record<string, unknown> = {};
  if (status !== undefined) updateData.status = status;
  if (paymentStatus !== undefined && !isPaidOnline) updateData.paymentStatus = paymentStatus;
  if (notes !== undefined) updateData.notes = notes;

  // Only apply if nobody changed the status meanwhile (e.g. the customer cancelled at the same moment)
  const updated = await prisma.order.updateMany({ where: { id, status: existing.status }, data: updateData });
  if (updated.count !== 1) {
    return NextResponse.json({ message: "The order was changed by someone else. Please refresh." }, { status: 409 });
  }

  return NextResponse.json({ order: await loadOrder(id) });
}

const ORDER_STATUSES = ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"] as const;
type OrderStatusValue = (typeof ORDER_STATUSES)[number];
const PAYMENT_STATUSES = ["PENDING", "PAID", "FAILED", "REFUNDED"] as const;
const FULFILMENT_FLOW = ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"] as const;
// The admin can cancel (and refund) until the order is delivered
const ADMIN_CANCELLABLE = ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED"] as const;

function loadOrder(id: string) {
  return prisma.order.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true } },
      items: { include: { product: { select: { id: true, name: true } } } },
    },
  });
}
