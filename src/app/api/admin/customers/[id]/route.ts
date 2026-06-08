import { NextRequest, NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = authorizeAdmin(request);
  if (!admin) return NextResponse.json({ message: "Access denied: Admins only" }, { status: 403 });

  const { id } = await params;
  const customer = await prisma.user.findUnique({
    where: { id, role: "USER" },
    select: {
      id: true, name: true, email: true, phone: true,
      isVerified: true, isActive: true, createdAt: true, updatedAt: true,
      orders: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true, orderNumber: true, status: true, paymentStatus: true,
          total: true, createdAt: true,
        },
      },
      _count: { select: { orders: true } },
    },
  });

  if (!customer) return NextResponse.json({ message: "Customer not found" }, { status: 404 });

  const totalSpent = await prisma.order.aggregate({
    _sum: { total: true },
    where: { userId: id, paymentStatus: "PAID" },
  });

  return NextResponse.json({ customer, totalSpent: Number(totalSpent._sum.total || 0).toFixed(2) });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = authorizeAdmin(request);
  if (!admin) return NextResponse.json({ message: "Access denied: Admins only" }, { status: 403 });

  const { id } = await params;
  const body = await request.json();
  const { isActive, name, email, phone, isVerified } = body;

  const existing = await prisma.user.findUnique({ where: { id, role: "USER" } });
  if (!existing) return NextResponse.json({ message: "Customer not found" }, { status: 404 });

  const customer = await prisma.user.update({
    where: { id },
    data: {
      isActive: isActive !== undefined ? isActive : undefined,
      name: name !== undefined ? name : undefined,
      email: email !== undefined ? email : undefined,
      phone: phone !== undefined ? phone : undefined,
      isVerified: isVerified !== undefined ? isVerified : undefined,
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      isActive: true,
      isVerified: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ customer });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = authorizeAdmin(request);
  if (!admin) return NextResponse.json({ message: "Access denied: Admins only" }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.user.findUnique({ where: { id, role: "USER" } });
  if (!existing) return NextResponse.json({ message: "Customer not found" }, { status: 404 });

  if (existing.isActive) {
    return NextResponse.json({ message: "Only suspended customers can be deleted. Please suspend the account first." }, { status: 400 });
  }

  // Delete all related records in transaction to prevent constraint violations
  await prisma.$transaction([
    prisma.orderItem.deleteMany({ where: { order: { userId: id } } }),
    prisma.order.deleteMany({ where: { userId: id } }),
    prisma.wishlistItem.deleteMany({ where: { userId: id } }),
    prisma.user.delete({ where: { id } }),
  ]);

  return NextResponse.json({ message: "Customer deleted successfully" });
}
