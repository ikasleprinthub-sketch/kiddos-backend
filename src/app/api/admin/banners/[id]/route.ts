import { NextRequest, NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseBannerInput } from "@/lib/banners";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = authorizeAdmin(request);
  if (!admin) return NextResponse.json({ message: "Access denied: Admins only" }, { status: 403 });

  const { id } = await params;
  const banner = await prisma.banner.findUnique({ where: { id } });
  if (!banner) return NextResponse.json({ message: "Banner not found" }, { status: 404 });

  return NextResponse.json({ banner });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = authorizeAdmin(request);
  if (!admin) return NextResponse.json({ message: "Access denied: Admins only" }, { status: 403 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = parseBannerInput(body, true);
  if ("error" in parsed) return NextResponse.json({ message: parsed.error }, { status: 400 });

  const existing = await prisma.banner.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ message: "Banner not found" }, { status: 404 });

  try {
    const banner = await prisma.banner.update({ where: { id }, data: parsed.data });
    return NextResponse.json({ banner });
  } catch (error) {
    console.error("Banner update error:", error);
    return NextResponse.json({ message: "Failed to save banner" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = authorizeAdmin(request);
  if (!admin) return NextResponse.json({ message: "Access denied: Admins only" }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.banner.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ message: "Banner not found" }, { status: 404 });

  await prisma.banner.delete({ where: { id } });

  return NextResponse.json({ message: "Banner deleted" });
}
