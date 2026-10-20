import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PRODUCT_IMAGE_ORDER } from "@/lib/product-images";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");
  const search = searchParams.get("search") || "";
  const category = searchParams.get("category") || "";
  const featured = searchParams.get("featured");
  const popularBatter = searchParams.get("popularBatter");
  const spiceOil = searchParams.get("spiceOil");
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { isActive: true };

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
    ];
  }

  if (category) {
    where.category = { slug: category };
  }

  if (featured === "true") {
    where.isFeatured = true;
  }

  if (popularBatter === "true") {
    where.isPopularBatter = true;
  }

  if (spiceOil === "true") {
    where.isSpiceOil = true;
  }

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
      include: {
        category: { select: { id: true, name: true, slug: true } },
        images: { select: { url: true, isPrimary: true }, orderBy: PRODUCT_IMAGE_ORDER },
        variants: true,
      },
    }),
    prisma.product.count({ where }),
  ]);

  return NextResponse.json({
    products,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  });
}
