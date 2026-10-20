import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isBannerPosition } from "@/lib/banners";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const position = searchParams.get("position") || "HOME";
  if (!isBannerPosition(position)) {
    return NextResponse.json({ message: "Invalid banner position" }, { status: 400 });
  }
  const limitParam = Number(searchParams.get("limit"));
  const take = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 50) : undefined;

  try {
    const banners = await prisma.banner.findMany({
      where: { isActive: true, position },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      take,
    });

    return NextResponse.json(banners);
  } catch (error) {
    console.error("Error fetching banners:", error);
    return NextResponse.json({ message: "Failed to fetch banners" }, { status: 500 });
  }
}
