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
  const isActive = searchParams.get("isActive");
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { role: "USER" };
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ];
  }
  if (isActive !== null && isActive !== "") where.isActive = isActive === "true";

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true, name: true, email: true, phone: true,
        isVerified: true, isActive: true, createdAt: true,
        _count: { select: { orders: true } },
        // Sign-up doesn't ask for a phone, so fall back to the one given at the latest checkout
        orders: { take: 1, orderBy: { createdAt: "desc" }, select: { shippingAddress: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  const customers = users.map(({ orders, ...user }) => {
    const address = orders[0]?.shippingAddress as { phone?: unknown } | null | undefined;
    const orderPhone = typeof address?.phone === "string" && address.phone.trim() ? address.phone.trim() : null;
    return { ...user, orderPhone };
  });

  return NextResponse.json({ customers, total, page, limit, pages: Math.ceil(total / limit) });
}
