import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parsePagination } from "@/lib/pagination";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const { limit } = parsePagination(searchParams, { defaultLimit: 100, maxLimit: 200 });

  const categories = await prisma.category.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      image: true,
      sortOrder: true,
      isActive: true,
      _count: { select: { products: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    take: limit,
  });

  return NextResponse.json({ categories });
}
