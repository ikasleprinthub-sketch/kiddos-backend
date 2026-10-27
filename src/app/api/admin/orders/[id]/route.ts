import { NextRequest, NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = authorizeAdmin(request);
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
  const admin = authorizeAdmin(request);
  if (!admin) return NextResponse.json({ message: "Access denied: Admins only" }, { status: 403 });

  const { id } = await params;
  const body = await request.json();
  const { status, paymentStatus, notes } = body;

  const existing = await prisma.order.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ message: "Order not found" }, { status: 404 });

  const isPaidOnline = existing.paymentMethod === "RAZORPAY" && existing.paymentStatus === "PAID";
  if (isPaidOnline && status !== undefined && status !== "CANCELLED") {
    return NextResponse.json(
      { message: "Online-paid orders can only be cancelled; other status changes are locked" },
      { status: 409 }
    );
  }
  if (isPaidOnline && paymentStatus !== undefined) {
    return NextResponse.json(
      { message: "Payment status is locked for online-paid orders" },
      { status: 409 }
    );
  }

  const updateData: Record<string, unknown> = {};
  if (status !== undefined) updateData.status = status;
  if (paymentStatus !== undefined) updateData.paymentStatus = paymentStatus;
  if (notes !== undefined) updateData.notes = notes;

  const order = await prisma.order.update({
    where: { id },
    data: updateData,
    include: {
      user: { select: { id: true, name: true, email: true } },
      items: { include: { product: { select: { id: true, name: true } } } },
    },
  });

  return NextResponse.json({ order });
}
