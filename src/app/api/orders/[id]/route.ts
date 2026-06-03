import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ message: "Authentication required" }, { status: 401 });
  }

  const { id } = await params;

  const order = await prisma.order.findFirst({
    where: { id, userId: user.id },
    include: {
      items: {
        include: {
          product: {
            select: {
              id: true, name: true, sku: true,
              images: { where: { isPrimary: true }, take: 1 },
            },
          },
        },
      },
      coupon: { select: { code: true } },
    },
  });

  if (!order) {
    return NextResponse.json({ message: "Order not found" }, { status: 404 });
  }

  return NextResponse.json({ order });
}
