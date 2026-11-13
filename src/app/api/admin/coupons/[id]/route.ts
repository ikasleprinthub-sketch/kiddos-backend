import { NextRequest, NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await authorizeAdmin(request);
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
  const admin = await authorizeAdmin(request);
  if (!admin) return NextResponse.json({ message: "Access denied: Admins only" }, { status: 403 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ message: "Invalid request" }, { status: 400 });
  const { code, type, value, minOrderAmount, maxUses, isActive, expiresAt } = body;

  const existing = await prisma.coupon.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ message: "Coupon not found" }, { status: 404 });

  // Same rules as creating a coupon
  const finalType = type ?? existing.type;
  const finalValue = value !== undefined ? Number(value) : Number(existing.value);
  if (code !== undefined && (typeof code !== "string" || !code.trim() || code.trim().length > 50)) {
    return NextResponse.json({ message: "Coupon code is required (max 50 characters)" }, { status: 400 });
  }
  if (!["PERCENTAGE", "FIXED"].includes(finalType)) {
    return NextResponse.json({ message: "Valid coupon type is required (PERCENTAGE or FIXED)" }, { status: 400 });
  }
  if (!Number.isFinite(finalValue) || finalValue <= 0) {
    return NextResponse.json({ message: "Valid positive value is required" }, { status: 400 });
  }
  if (finalType === "PERCENTAGE" && finalValue > 100) {
    return NextResponse.json({ message: "Percentage cannot exceed 100" }, { status: 400 });
  }
  if (minOrderAmount !== undefined && minOrderAmount !== null && minOrderAmount !== "" && !(Number(minOrderAmount) >= 0)) {
    return NextResponse.json({ message: "Minimum order amount must be 0 or more" }, { status: 400 });
  }
  if (maxUses !== undefined && maxUses !== null && maxUses !== "" && !(Number.isInteger(Number(maxUses)) && Number(maxUses) >= 1)) {
    return NextResponse.json({ message: "Maximum uses must be a whole number of at least 1" }, { status: 400 });
  }
  if (expiresAt && Number.isNaN(new Date(expiresAt).getTime())) {
    return NextResponse.json({ message: "Invalid expiry date" }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {};
  if (code !== undefined) {
    const normalized = code.trim().toUpperCase();
    if (normalized !== existing.code && (await prisma.coupon.findUnique({ where: { code: normalized } }))) {
      return NextResponse.json({ message: "Coupon code already exists" }, { status: 409 });
    }
    updateData.code = normalized;
  }
  if (type !== undefined) updateData.type = type;
  if (value !== undefined) updateData.value = finalValue;
  if (minOrderAmount !== undefined) updateData.minOrderAmount = minOrderAmount || null;
  if (maxUses !== undefined) updateData.maxUses = maxUses ? Number(maxUses) : null;
  if (isActive !== undefined) updateData.isActive = Boolean(isActive);
  if (expiresAt !== undefined) updateData.expiresAt = expiresAt ? new Date(expiresAt) : null;

  const coupon = await prisma.coupon.update({ where: { id }, data: updateData });

  return NextResponse.json({ coupon });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await authorizeAdmin(request);
  if (!admin) return NextResponse.json({ message: "Access denied: Admins only" }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.coupon.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ message: "Coupon not found" }, { status: 404 });

  // Orders keep a link to the coupon they used, so a used coupon can't be removed from the database.
  // Turn it off instead: it stops working at checkout and the order history stays intact.
  const usedBy = await prisma.order.count({ where: { couponId: id } });
  if (usedBy > 0) {
    await prisma.coupon.update({ where: { id }, data: { isActive: false } });
    return NextResponse.json({
      message: `This coupon was used in ${usedBy} order(s), so it was deactivated instead of deleted.`,
      deactivated: true,
    });
  }

  await prisma.coupon.delete({ where: { id } });

  return NextResponse.json({ message: "Coupon deleted" });
}
