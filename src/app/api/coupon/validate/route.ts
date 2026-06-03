import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ message: "Authentication required" }, { status: 401 });
  }

  const body = await request.json();
  const { code, subtotal } = body as { code: string; subtotal?: number };

  if (!code?.trim()) {
    return NextResponse.json({ message: "Coupon code is required" }, { status: 400 });
  }

  const coupon = await prisma.coupon.findUnique({
    where: { code: code.trim().toUpperCase() },
  });

  if (!coupon || !coupon.isActive) {
    return NextResponse.json({ message: "Invalid coupon code" }, { status: 404 });
  }

  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
    return NextResponse.json({ message: "This coupon has expired" }, { status: 400 });
  }

  if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
    return NextResponse.json({ message: "Coupon usage limit has been reached" }, { status: 400 });
  }

  if (subtotal !== undefined && coupon.minOrderAmount && subtotal < Number(coupon.minOrderAmount)) {
    return NextResponse.json(
      { message: `Minimum order amount for this coupon is ₹${coupon.minOrderAmount}` },
      { status: 400 }
    );
  }

  let discount = 0;
  if (subtotal !== undefined) {
    if (coupon.type === "PERCENTAGE") {
      discount = (subtotal * Number(coupon.value)) / 100;
    } else {
      discount = Math.min(Number(coupon.value), subtotal);
    }
  }

  return NextResponse.json({
    valid: true,
    coupon: {
      code: coupon.code,
      type: coupon.type,
      value: Number(coupon.value),
      minOrderAmount: coupon.minOrderAmount ? Number(coupon.minOrderAmount) : null,
      expiresAt: coupon.expiresAt,
    },
    discount: parseFloat(discount.toFixed(2)),
  });
}
