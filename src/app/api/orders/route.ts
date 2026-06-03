import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ message: "Authentication required" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "10");
  const skip = (page - 1) * limit;

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where: { userId: user.id },
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true, name: true,
                images: { where: { isPrimary: true }, take: 1 },
              },
            },
          },
        },
        coupon: { select: { code: true } },
      },
    }),
    prisma.order.count({ where: { userId: user.id } }),
  ]);

  return NextResponse.json({ orders, total, page, limit, pages: Math.ceil(total / limit) });
}
