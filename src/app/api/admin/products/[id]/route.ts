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
  if (!admin) return NextResponse.json({ message: "Access denied: Admins only" }, { status: 403 });

  const { id } = await params;
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      category: true,
      images: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
    },
  });

  if (!product) return NextResponse.json({ message: "Product not found" }, { status: 404 });

  return NextResponse.json({ product });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = authorizeAdmin(request);
  if (!admin) return NextResponse.json({ message: "Access denied: Admins only" }, { status: 403 });

  const { id } = await params;
  const body = await request.json();
  const {
    name, description, price, salePrice, stock, sku,
    categoryId, images, isActive, isFeatured, isPopularBatter, isSpiceOil, weight, unit, tags,
  } = body;

  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ message: "Product not found" }, { status: 404 });

  const updateData: Record<string, unknown> = {};
  if (name !== undefined) {
    updateData.name = name.trim();
    updateData.slug = slugify(name);
  }
  if (description !== undefined) updateData.description = description;
  if (price !== undefined) updateData.price = price;
  if (salePrice !== undefined) updateData.salePrice = salePrice || null;
  if (stock !== undefined) updateData.stock = stock;
  if (sku !== undefined) updateData.sku = sku || null;
  if (categoryId !== undefined) updateData.categoryId = categoryId;
  if (isActive !== undefined) updateData.isActive = isActive;
  if (isFeatured !== undefined) updateData.isFeatured = isFeatured;
  if (isPopularBatter !== undefined) updateData.isPopularBatter = isPopularBatter;
  if (isSpiceOil !== undefined) updateData.isSpiceOil = isSpiceOil;
  if (weight !== undefined) updateData.weight = weight || null;
  if (unit !== undefined) updateData.unit = unit;
  if (tags !== undefined) updateData.tags = tags;

  if (images !== undefined) {
    await prisma.productImage.deleteMany({ where: { productId: id } });
    updateData.images = {
      create: images.map((url: string, i: number) => ({ url, isPrimary: i === 0 })),
    };
  }

  const product = await prisma.product.update({
    where: { id },
    data: updateData,
    include: {
      category: { select: { id: true, name: true } },
      images: true,
    },
  });

  return NextResponse.json({ product });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = authorizeAdmin(request);
  if (!admin) return NextResponse.json({ message: "Access denied: Admins only" }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ message: "Product not found" }, { status: 404 });

  await prisma.product.delete({ where: { id } });

  return NextResponse.json({ message: "Product deleted" });
}
