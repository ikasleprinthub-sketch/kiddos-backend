import { NextRequest, NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseOptionalImage } from "@/lib/uploads";

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
  // Escape LIKE wildcards so "%" or "_" are matched literally
  const search = (searchParams.get("search") || "").trim().replace(/[\\%_]/g, (c) => `\\${c}`);
  const skip = (page - 1) * limit;

  const where = search
    ? {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { slug: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [categories, total] = await Promise.all([
    prisma.category.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      include: { _count: { select: { products: true } } },
    }),
    prisma.category.count({ where }),
  ]);

  return NextResponse.json({ categories, total, page, limit, pages: Math.ceil(total / limit) });
}

export async function POST(request: NextRequest) {
  const admin = authorizeAdmin(request);
  if (!admin) {
    return NextResponse.json({ message: "Access denied: Admins only" }, { status: 403 });
  }

  const body = await request.json();
  const { name, description, image, isActive = true, sortOrder = 0 } = body;

  if (!name?.trim()) {
    return NextResponse.json({ message: "Category name is required" }, { status: 400 });
  }
  const parsedImage = parseOptionalImage(image);
  if ("error" in parsedImage) return NextResponse.json({ message: parsedImage.error }, { status: 400 });

  const slug = slugify(name);

  const existing = await prisma.category.findFirst({ where: { OR: [{ name }, { slug }] } });
  if (existing) {
    return NextResponse.json({ message: "Category name already exists" }, { status: 409 });
  }

  const category = await prisma.category.create({
    data: { name: name.trim(), slug, description, image: parsedImage.value ?? null, isActive, sortOrder },
  });

  return NextResponse.json({ category }, { status: 201 });
}
