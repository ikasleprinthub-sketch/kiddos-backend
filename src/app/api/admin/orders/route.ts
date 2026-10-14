import { NextRequest, NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ORDER_STATUSES = ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"];

export async function GET(request: NextRequest) {
  const admin = authorizeAdmin(request);
  if (!admin) return NextResponse.json({ message: "Access denied: Admins only" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20") || 20));
  const search = searchParams.get("search") || "";
  const status = searchParams.get("status") || "";
  const paymentStatus = searchParams.get("paymentStatus") || "";
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (search) {
    where.OR = [
      { orderNumber: { contains: search, mode: "insensitive" } },
      { user: { name: { contains: search, mode: "insensitive" } } },
      { user: { email: { contains: search, mode: "insensitive" } } },
    ];
  }
  // status may be a single value or a comma separated list (e.g. PENDING,CONFIRMED,PROCESSING)
  const statuses = status.split(",").map((x) => x.trim()).filter((x) => ORDER_STATUSES.includes(x));
  if (statuses.length) where.status = statuses.length === 1 ? statuses[0] : { in: statuses };
  if (paymentStatus) where.paymentStatus = paymentStatus;

  const [orders, total, statusGroups] = await Promise.all([
    prisma.order.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, name: true, email: true } },
        items: {
          include: { product: { select: { id: true, name: true } } },
        },
        coupon: { select: { id: true, code: true } },
      },
    }),
    prisma.order.count({ where }),
    // per-status totals across ALL orders, independent of the current filter/page
    prisma.order.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const counts: Record<string, number> = {};
  for (const g of statusGroups) counts[g.status] = g._count._all;

  return NextResponse.json({ orders, total, page, limit, pages: Math.ceil(total / limit), counts });
}
