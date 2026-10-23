import { NextRequest, NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const phoneFromAddress = (address: unknown): string | null => {
  const phone = (address as { phone?: unknown } | null)?.phone;
  return typeof phone === "string" && phone.trim() ? phone.trim() : null;
};

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
        // Sign-up doesn't ask for a phone, so fall back to the newest one given at checkout
        orders: { take: 10, orderBy: { createdAt: "desc" }, select: { shippingAddress: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  // Last resort: a phone the customer left on the Contact Us form with the same email
  const noOrderPhone = users.filter((u) => !u.phone && !u.orders.some((o) => phoneFromAddress(o.shippingAddress)));
  const inquiries = noOrderPhone.length
    ? await prisma.contactInquiry.findMany({
        where: { email: { in: noOrderPhone.map((u) => u.email), mode: "insensitive" }, phone: { not: null } },
        orderBy: { createdAt: "desc" },
        select: { email: true, phone: true },
      })
    : [];
  const inquiryPhone = new Map<string, string>();
  for (const i of inquiries) {
    const key = i.email.toLowerCase();
    if (i.phone?.trim() && !inquiryPhone.has(key)) inquiryPhone.set(key, i.phone.trim());
  }

  const customers = users.map(({ orders, ...user }) => {
    const orderPhone = orders.map((o) => phoneFromAddress(o.shippingAddress)).find(Boolean)
      ?? inquiryPhone.get(user.email.toLowerCase())
      ?? null;
    return { ...user, orderPhone };
  });

  return NextResponse.json({ customers, total, page, limit, pages: Math.ceil(total / limit) });
}
