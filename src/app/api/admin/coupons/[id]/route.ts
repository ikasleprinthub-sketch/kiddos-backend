import { NextRequest, NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = authorizeAdmin(request);
  if (!admin) return NextResponse.json({ message: "Access denied: Admins only" }, { status: 403 });

  const { id } = await params;
  const coupon = await prisma.coupon.findUnique({
    where: { id },
    include: { _count: { select: { orders: true } } },
  });

  if (!coupon) return NextResponse.json({ message: "Coupon not found" }, { status: 404 });

  return NextResponse.json({ coupon });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = authorizeAdmin(request);
  if (!admin) return NextResponse.json({ message: "Access denied: Admins only" }, { status: 403 });

  const { id } = await params;
  const body = await request.json();
  const { code, type, value, minOrderAmount, maxUses, isActive, expiresAt } = body;

  const existing = await prisma.coupon.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ message: "Coupon not found" }, { status: 404 });

  const updateData: Record<string, unknown> = {};
  if (code !== undefined) updateData.code = code.trim().toUpperCase();
  if (type !== undefined) updateData.type = type;
  if (value !== undefined) updateData.value = value;
  if (minOrderAmount !== undefined) updateData.minOrderAmount = minOrderAmount || null;
  if (maxUses !== undefined) updateData.maxUses = maxUses || null;
  if (isActive !== undefined) updateData.isActive = isActive;
  if (expiresAt !== undefined) updateData.expiresAt = expiresAt ? new Date(expiresAt) : null;

  const coupon = await prisma.coupon.update({ where: { id }, data: updateData });

  return NextResponse.json({ coupon });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = authorizeAdmin(request);
  if (!admin) return NextResponse.json({ message: "Access denied: Admins only" }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.coupon.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ message: "Coupon not found" }, { status: 404 });

  await prisma.coupon.delete({ where: { id } });

  return NextResponse.json({ message: "Coupon deleted" });
}
