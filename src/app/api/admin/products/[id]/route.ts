import { NextRequest, NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseProductImages, productImageRows, PRODUCT_IMAGE_ORDER } from "@/lib/product-images";

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
      images: { orderBy: PRODUCT_IMAGE_ORDER },
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

    // Validate everything before touching the database, so a bad request changes nothing
    let imageUrls: string[] | undefined;
    if (images !== undefined) {
      const parsed = parseProductImages(images);
      if ("error" in parsed) return NextResponse.json({ message: parsed.error }, { status: 400 });
      imageUrls = parsed.urls;
    }

    let variantRows: { id?: string; data: Record<string, unknown> }[] | undefined;
    if (variants !== undefined && Array.isArray(variants) && variants.length > 0) {
      variantRows = variants
        .filter((v: any) => v && v.price !== undefined && v.price !== null && v.price !== "")
        .map((v: any) => ({
          id: typeof v.id === "string" ? v.id : undefined,
          data: {
            weight: v.weight ? Number(v.weight) : null,
            unit: v.unit || null,
            price: Number(v.price),
            salePrice: v.salePrice ? Number(v.salePrice) : null,
            stock: Number(v.stock) || 0,
            sku: v.sku || null,
            isActive: v.isActive ?? true,
          },
        }));
      if (variantRows!.some((v) => isNaN(v.data.price as number))) {
        return NextResponse.json({ message: "Every variant needs a valid price" }, { status: 400 });
      }
    }

    // Images, variants and product fields are saved together: if any step fails, none of it is applied
    const product = await prisma.$transaction(async (tx) => {
      if (imageUrls !== undefined) {
        const current = await tx.productImage.findMany({ where: { productId: id }, orderBy: PRODUCT_IMAGE_ORDER });
        const unchanged = current.length === imageUrls.length && current.every((img, i) => img.url === imageUrls![i]);
        if (!unchanged) {
          await tx.productImage.deleteMany({ where: { productId: id } });
          await tx.productImage.createMany({
            data: productImageRows(imageUrls).map((row) => ({ ...row, productId: id })),
          });
        }
      }

      if (variantRows !== undefined) {
        // Update variants in place (keeps their ids stable for carts and past orders)
        const current = await tx.productVariant.findMany({
          where: { productId: id },
          select: { id: true, _count: { select: { orderItems: true } } },
        });
        const currentIds = new Set(current.map((v) => v.id));
        const keptIds = new Set<string>();
        for (const v of variantRows) {
          if (v.id && currentIds.has(v.id)) {
            keptIds.add(v.id);
            await tx.productVariant.update({ where: { id: v.id }, data: v.data });
          } else {
            await tx.productVariant.create({ data: { ...v.data, productId: id } as any });
          }
        }
        for (const v of current) {
          if (keptIds.has(v.id)) continue;
          // Variants that appear in orders can't be deleted; hide them instead
          if (v._count.orderItems > 0) {
            await tx.productVariant.update({ where: { id: v.id }, data: { isActive: false } });
          } else {
            await tx.productVariant.delete({ where: { id: v.id } });
          }
        }
      }

      return tx.product.update({
        where: { id },
        data: updateData,
        include: {
          category: true,
          images: { orderBy: PRODUCT_IMAGE_ORDER },
          variants: { orderBy: { createdAt: "asc" } },
        },
      });
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
    if (error.code === "P2003") {
      return NextResponse.json({ message: "Invalid category or related record — nothing was changed" }, { status: 400 });
    }
    return NextResponse.json(
      { message: "Failed to update product — nothing was changed" },
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
