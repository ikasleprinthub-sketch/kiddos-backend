import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";

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

    const body = await req.json();
    
    // Handle sync of multiple items from local storage
    if (body.productIds && Array.isArray(body.productIds)) {
      const productIds = body.productIds as string[];
      
      let syncedCount = 0;
      for (const productId of productIds) {
        // Only insert if it doesn't already exist
        const existing = await prisma.wishlistItem.findUnique({
          where: {
            userId_productId: {
              userId: user.id,
              productId,
            },
          },
        });

        if (!existing) {
          // Verify product exists
          const productExists = await prisma.product.findUnique({ where: { id: productId } });
          if (productExists) {
            await prisma.wishlistItem.create({
              data: {
                userId: user.id,
                productId,
              },
            });
            syncedCount++;
          }
        }
      }
      return NextResponse.json({ success: true, syncedCount });
    }

    // Handle single item addition
    if (!body.productId) {
      return NextResponse.json({ error: "productId is required" }, { status: 400 });
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
