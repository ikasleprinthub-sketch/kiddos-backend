import { NextRequest, NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const admin = authorizeAdmin(request);
  if (!admin) return NextResponse.json({ message: "Access denied: Admins only" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const position = searchParams.get("position") || "";
  const isActive = searchParams.get("isActive");

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

  const body = await request.json();
  const { title, subtitle, image, link, isActive = true, sortOrder = 0, position = "HOME" } = body;

  if (!title?.trim()) return NextResponse.json({ message: "Banner title is required" }, { status: 400 });
  if (!image?.trim()) return NextResponse.json({ message: "Banner image is required" }, { status: 400 });

  const validPositions = ["HOME", "CATEGORY", "PRODUCT", "CHECKOUT"];
  if (!validPositions.includes(position)) {
    return NextResponse.json({ message: "Invalid banner position" }, { status: 400 });
  }

  const banner = await prisma.banner.create({
    data: { title: title.trim(), subtitle, image, link, isActive, sortOrder, position },
  });

  return NextResponse.json({ banner }, { status: 201 });
}
