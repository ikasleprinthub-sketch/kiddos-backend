import { NextRequest, NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseBannerInput, isBannerPosition } from "@/lib/banners";

export async function GET(request: NextRequest) {
  const admin = authorizeAdmin(request);
  if (!admin) return NextResponse.json({ message: "Access denied: Admins only" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const position = searchParams.get("position") || "";
  const isActive = searchParams.get("isActive");
  if (position && !isBannerPosition(position)) {
    return NextResponse.json({ message: "Invalid banner position" }, { status: 400 });
  }

  const where: Record<string, unknown> = {};
  if (position) where.position = position;
  if (isActive !== null && isActive !== "") where.isActive = isActive === "true";

  const banners = await prisma.banner.findMany({
    where,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({ banners });
}

export async function POST(request: NextRequest) {
  const admin = authorizeAdmin(request);
  if (!admin) return NextResponse.json({ message: "Access denied: Admins only" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = parseBannerInput(body, false);
  if ("error" in parsed) return NextResponse.json({ message: parsed.error }, { status: 400 });

  try {
    const banner = await prisma.banner.create({ data: parsed.data as { image: string } });
    return NextResponse.json({ banner }, { status: 201 });
  } catch (error) {
    console.error("Banner create error:", error);
    return NextResponse.json({ message: "Failed to save banner" }, { status: 500 });
  }
}
