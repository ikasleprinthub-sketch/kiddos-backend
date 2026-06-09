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
      variants: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!product) return NextResponse.json({ message: "Product not found" }, { status: 404 });

  return NextResponse.json({ product });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = authorizeAdmin(request);
    if (!admin) return NextResponse.json({ message: "Access denied: Admins only" }, { status: 403 });

    const { id } = await params;
    const body = await request.json();
    const {
      name, description, price, salePrice, stock, sku,
      categoryId, images, isActive, isFeatured, isPopularBatter, isSpiceOil, weight, unit, tags,
      ingredients, healthBenefits, usageInstructions, nutrientFacts, shelfLife, storageInstructions,
      variants,
    } = body;

    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: "Product not found" }, { status: 404 });

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) {
      updateData.name = name.trim();
      const newSlug = slugify(name);

      // Only update slug if it's different to avoid unnecessary unique constraint checks
      if (newSlug !== existing.slug) {
        const slugExists = await prisma.product.findUnique({ where: { slug: newSlug } });
        if (slugExists) {
          return NextResponse.json(
            { message: `A product with the slug "${newSlug}" already exists` },
            { status: 409 }
          );
        }
        updateData.slug = newSlug;
      }
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
  if (ingredients !== undefined) updateData.ingredients = ingredients || null;
  if (healthBenefits !== undefined) updateData.healthBenefits = healthBenefits || null;
  if (usageInstructions !== undefined) updateData.usageInstructions = usageInstructions || null;
  if (nutrientFacts !== undefined) updateData.nutrientFacts = nutrientFacts || null;
  if (shelfLife !== undefined) updateData.shelfLife = shelfLife || null;
  if (storageInstructions !== undefined) updateData.storageInstructions = storageInstructions || null;

  if (images !== undefined) {
    await prisma.productImage.deleteMany({ where: { productId: id } });
    updateData.images = {
      create: images.map((url: string, i: number) => ({ url, isPrimary: i === 0 })),
    };
  }

  if (variants !== undefined && Array.isArray(variants) && variants.length > 0) {
    await prisma.productVariant.deleteMany({ where: { productId: id } });
    updateData.variants = {
      create: variants
        .filter((v: any) => v && v.price !== undefined && v.price !== null)
        .map((v: any) => ({
          weight: v.weight ? Number(v.weight) : null,
          unit: v.unit || null,
          price: Number(v.price),
          salePrice: v.salePrice ? Number(v.salePrice) : null,
          stock: Number(v.stock) || 0,
          sku: v.sku || null,
          isActive: v.isActive ?? true,
        })),
    };
  }

    const product = await prisma.product.update({
      where: { id },
      data: updateData,
      include: {
        category: true,
        images: true,
        variants: true,
      },
    });

    return NextResponse.json({ product });
  } catch (error: any) {
    console.error("Product update error:", error);
    if (error.code === "P2002") {
      const target = error.meta?.target?.[0];
      return NextResponse.json(
        { message: `A product with this ${target} already exists` },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { message: "Failed to update product" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = authorizeAdmin(request);
  if (!admin) return NextResponse.json({ message: "Access denied: Admins only" }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ message: "Product not found" }, { status: 404 });

  const orderItemCount = await prisma.orderItem.count({ where: { productId: id } });
  if (orderItemCount > 0) {
    return NextResponse.json(
      {
        message: `Cannot delete this product — it appears in ${orderItemCount} order(s). Deactivate it instead to hide it from the store.`,
        suggestion: "Set isActive to false to deactivate the product.",
      },
      { status: 409 }
    );
  }

  await prisma.product.delete({ where: { id } });

  return NextResponse.json({ message: "Product deleted" });
}
