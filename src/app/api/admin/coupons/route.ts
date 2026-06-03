import { NextRequest, NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const admin = authorizeAdmin(request);
  if (!admin) return NextResponse.json({ message: "Access denied: Admins only" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");
  const search = searchParams.get("search") || "";
  const skip = (page - 1) * limit;

  const where = search
    ? { code: { contains: search, mode: "insensitive" as const } }
    : {};

  const [coupons, total] = await Promise.all([
    prisma.coupon.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { orders: true } } },
    }),
    prisma.coupon.count({ where }),
  ]);

  return NextResponse.json({ coupons, total, page, limit, pages: Math.ceil(total / limit) });
}

export async function POST(request: NextRequest) {
  const admin = authorizeAdmin(request);
  if (!admin) return NextResponse.json({ message: "Access denied: Admins only" }, { status: 403 });

  const body = await request.json();
  const { code, type, value, minOrderAmount, maxUses, isActive = true, expiresAt } = body;

  if (!code?.trim()) return NextResponse.json({ message: "Coupon code is required" }, { status: 400 });
  if (!type || !["PERCENTAGE", "FIXED"].includes(type)) {
    return NextResponse.json({ message: "Valid coupon type is required (PERCENTAGE or FIXED)" }, { status: 400 });
  }
  if (!value || isNaN(Number(value)) || Number(value) <= 0) {
    return NextResponse.json({ message: "Valid positive value is required" }, { status: 400 });
  }
  if (type === "PERCENTAGE" && Number(value) > 100) {
    return NextResponse.json({ message: "Percentage cannot exceed 100" }, { status: 400 });
  }

  const existing = await prisma.coupon.findUnique({ where: { code: code.trim().toUpperCase() } });
  if (existing) return NextResponse.json({ message: "Coupon code already exists" }, { status: 409 });

  const coupon = await prisma.coupon.create({
    data: {
      code: code.trim().toUpperCase(),
      type,
      value,
      minOrderAmount: minOrderAmount || null,
      maxUses: maxUses || null,
      isActive,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    },
  });

  return NextResponse.json({ coupon }, { status: 201 });
}
