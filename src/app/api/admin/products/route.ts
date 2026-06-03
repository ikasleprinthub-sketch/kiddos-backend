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

export async function GET(request: NextRequest) {
  const admin = authorizeAdmin(request);
  if (!admin) {
    return NextResponse.json({ message: "Access denied: Admins only" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");
  const search = searchParams.get("search") || "";
  const categoryId = searchParams.get("categoryId") || "";
  const isActive = searchParams.get("isActive");
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { sku: { contains: search, mode: "insensitive" } },
    ];
  }
  if (categoryId) where.categoryId = categoryId;
  if (isActive !== null && isActive !== "") where.isActive = isActive === "true";

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        category: { select: { id: true, name: true } },
        images: { where: { isPrimary: true }, take: 1 },
      },
    }),
    prisma.product.count({ where }),
  ]);

  return NextResponse.json({ products, total, page, limit, pages: Math.ceil(total / limit) });
}

export async function POST(request: NextRequest) {
  const admin = authorizeAdmin(request);
  if (!admin) {
    return NextResponse.json({ message: "Access denied: Admins only" }, { status: 403 });
  }

  const body = await request.json();
  const {
    name, description, price, salePrice, stock = 0, sku,
    categoryId, images = [], isActive = true, isFeatured = false,
    isPopularBatter = false, isSpiceOil = false,
    weight, unit, tags = [],
    ingredients, healthBenefits, usageInstructions, nutrientFacts, shelfLife, storageInstructions,
  } = body;

  if (!name?.trim()) return NextResponse.json({ message: "Product name is required" }, { status: 400 });
  if (!price || isNaN(Number(price))) return NextResponse.json({ message: "Valid price is required" }, { status: 400 });
  if (!categoryId) return NextResponse.json({ message: "Category is required" }, { status: 400 });

  const slug = slugify(name);
  const existingSlug = await prisma.product.findUnique({ where: { slug } });
  if (existingSlug) {
    return NextResponse.json({ message: "A product with this name already exists" }, { status: 409 });
  }

  if (sku) {
    const existingSku = await prisma.product.findUnique({ where: { sku } });
    if (existingSku) return NextResponse.json({ message: "SKU already in use" }, { status: 409 });
  }

  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category) return NextResponse.json({ message: "Category not found" }, { status: 404 });

  const product = await prisma.product.create({
    data: {
      name: name.trim(),
      slug,
      description,
      price,
      salePrice: salePrice || null,
      stock,
      sku: sku || null,
      categoryId,
      isActive,
      isFeatured,
      isPopularBatter,
      isSpiceOil,
      weight: weight || null,
      unit: unit || null,
      tags,
      ingredients: ingredients || null,
      healthBenefits: healthBenefits || null,
      usageInstructions: usageInstructions || null,
      nutrientFacts: nutrientFacts || undefined,
      shelfLife: shelfLife || null,
      storageInstructions: storageInstructions || null,
      images: {
        create: images.map((url: string, i: number) => ({ url, isPrimary: i === 0 })),
      },
    },
    include: {
      category: { select: { id: true, name: true } },
      images: true,
    },
  });

  return NextResponse.json({ product }, { status: 201 });
}
