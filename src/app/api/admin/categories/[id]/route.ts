import { NextRequest, NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = authorizeAdmin(request);
  if (!admin) {
    return NextResponse.json({ message: "Access denied: Admins only" }, { status: 403 });
  }

  const { id } = await params;
  const category = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { products: true } } },
  });

  if (!category) {
    return NextResponse.json({ message: "Category not found" }, { status: 404 });
  }

  return NextResponse.json({ category });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = authorizeAdmin(request);
  if (!admin) {
    return NextResponse.json({ message: "Access denied: Admins only" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const { name, description, image, isActive, sortOrder } = body;

  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ message: "Category not found" }, { status: 404 });
  }

  const updateData: Record<string, unknown> = {};
  if (name !== undefined) {
    updateData.name = name.trim();
    updateData.slug = slugify(name);
  }
  if (description !== undefined) updateData.description = description;
  if (image !== undefined) updateData.image = image;
  if (isActive !== undefined) updateData.isActive = isActive;
  if (sortOrder !== undefined) updateData.sortOrder = sortOrder;

  const category = await prisma.category.update({ where: { id }, data: updateData });

  return NextResponse.json({ category });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = authorizeAdmin(request);
  if (!admin) {
    return NextResponse.json({ message: "Access denied: Admins only" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { products: true } } },
  });

  if (!existing) {
    return NextResponse.json({ message: "Category not found" }, { status: 404 });
  }

  if (existing._count.products > 0) {
    return NextResponse.json(
      { message: `Cannot delete: ${existing._count.products} product(s) are assigned to this category` },
      { status: 409 }
    );
  }

  await prisma.category.delete({ where: { id } });

  return NextResponse.json({ message: "Category deleted" });
}
