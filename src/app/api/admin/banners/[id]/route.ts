import { NextRequest, NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
  const body = await request.json();
  const { title, subtitle, image, link, isActive, sortOrder, position } = body;

  const existing = await prisma.banner.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ message: "Banner not found" }, { status: 404 });

  const updateData: Record<string, unknown> = {};
  if (title !== undefined) updateData.title = title.trim();
  if (subtitle !== undefined) updateData.subtitle = subtitle;
  if (image !== undefined) updateData.image = image;
  if (link !== undefined) updateData.link = link;
  if (isActive !== undefined) updateData.isActive = isActive;
  if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
  if (position !== undefined) updateData.position = position;

  const banner = await prisma.banner.update({ where: { id }, data: updateData });

  return NextResponse.json({ banner });
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
