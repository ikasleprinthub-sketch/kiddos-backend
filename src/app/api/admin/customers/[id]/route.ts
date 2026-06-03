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
  const { isActive } = body;

  const existing = await prisma.user.findUnique({ where: { id, role: "USER" } });
  if (!existing) return NextResponse.json({ message: "Customer not found" }, { status: 404 });

  const customer = await prisma.user.update({
    where: { id },
    data: { isActive },
    select: { id: true, name: true, email: true, isActive: true },
  });

  return NextResponse.json({ customer });
}
