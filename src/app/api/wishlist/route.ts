import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";

// A wishlist sync from the browser's saved list never needs more than this
const MAX_SYNC = 200;

export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const items = await prisma.wishlistItem.findMany({
      where: { userId: user.id },
      include: {
        product: {
          include: {
            category: true,
            images: {
              where: { isPrimary: true },
              take: 1,
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ items });
  } catch (error: any) {
    console.error("Wishlist GET error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    // Handle sync of multiple items from local storage (bounded, and 2 queries instead of 3 per item)
    if (Array.isArray(body.productIds)) {
      const productIds = [...new Set(
        (body.productIds as unknown[]).filter((v): v is string => typeof v === "string" && v.length > 0 && v.length <= 64)
      )].slice(0, MAX_SYNC);

      const products = productIds.length
        ? await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true } })
        : [];
      const result = products.length
        ? await prisma.wishlistItem.createMany({
            data: products.map((p) => ({ userId: user.id, productId: p.id })),
            skipDuplicates: true,
          })
        : { count: 0 };
      return NextResponse.json({ success: true, syncedCount: result.count });
    }

    // Handle single item addition
    if (typeof body.productId !== "string" || !body.productId || body.productId.length > 64) {
      return NextResponse.json({ error: "productId is required" }, { status: 400 });
    }

    const product = await prisma.product.findUnique({ where: { id: body.productId }, select: { id: true } });
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const existing = await prisma.wishlistItem.findUnique({
      where: {
        userId_productId: {
          userId: user.id,
          productId: body.productId,
        },
      },
    });

    if (existing) {
      return NextResponse.json({ item: existing }); // Already in wishlist
    }

    const newItem = await prisma.wishlistItem.create({
      data: {
        userId: user.id,
        productId: body.productId,
      },
      include: {
        product: {
          include: {
            category: true,
            images: {
              where: { isPrimary: true },
              take: 1,
            },
          },
        },
      },
    });

    return NextResponse.json({ item: newItem });
  } catch (error: any) {
    console.error("Wishlist POST error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
