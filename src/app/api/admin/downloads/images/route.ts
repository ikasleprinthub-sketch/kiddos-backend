import { NextRequest, NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import JSZip from "jszip";

export async function GET(request: NextRequest) {
  try {
    const admin = authorizeAdmin(request);
    if (!admin) {
      return NextResponse.json({ message: "Access denied: Admins only" }, { status: 403 });
    }

    const zip = new JSZip();
    const uploadDir = process.env.UPLOAD_DIR || join(process.cwd(), "uploads");

    // Fetch all product images
    const productImages = await prisma.productImage.findMany({
      include: { product: { select: { name: true } } },
    });

    // Fetch all categories with images
    const categories = await prisma.category.findMany({
      where: { image: { not: null } },
      select: { id: true, name: true, image: true },
    });

    // Fetch all banners with images
    const banners = await prisma.banner.findMany({
      select: { id: true, title: true, image: true },
    });

    // Add product images to zip
    if (productImages.length > 0) {
      const productsFolder = zip.folder("products");
      for (const img of productImages) {
        const filename = img.url.split("/").pop() || "image";
        const filepath = join(uploadDir, "products", filename);

        try {
          if (existsSync(filepath)) {
            const fileBuffer = readFileSync(filepath);
            const productName = img.product.name?.replace(/[^a-z0-9]/gi, "_").toLowerCase() || "product";
            productsFolder?.file(`${productName}-${filename}`, fileBuffer);
          }
        } catch (err) {
          console.warn(`Failed to read product image: ${filepath}`);
        }
      }
    }

    // Add category images to zip
    if (categories.length > 0) {
      const categoriesFolder = zip.folder("categories");
      for (const cat of categories) {
        if (cat.image) {
          const filename = cat.image.split("/").pop() || "image";
          const filepath = join(uploadDir, "categories", filename);

          try {
            if (existsSync(filepath)) {
              const fileBuffer = readFileSync(filepath);
              const catName = cat.name.replace(/[^a-z0-9]/gi, "_").toLowerCase();
              categoriesFolder?.file(`${catName}-${filename}`, fileBuffer);
            }
          } catch (err) {
            console.warn(`Failed to read category image: ${filepath}`);
          }
        }
      }
    }

    // Add banner images to zip
    if (banners.length > 0) {
      const bannersFolder = zip.folder("banners");
      for (const banner of banners) {
        const filename = banner.image.split("/").pop() || "image";
        const filepath = join(uploadDir, "banners", filename);

        try {
          if (existsSync(filepath)) {
            const fileBuffer = readFileSync(filepath);
            const bannerName = (banner.title || "banner").replace(/[^a-z0-9]/gi, "_").toLowerCase();
            bannersFolder?.file(`${bannerName}-${filename}`, fileBuffer);
          }
        } catch (err) {
          console.warn(`Failed to read banner image: ${filepath}`);
        }
      }
    }

    const zipBuffer = await zip.generateAsync({ type: "arraybuffer" });

    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="images-${new Date().toISOString().split("T")[0]}.zip"`,
      },
    });
  } catch (error: any) {
    console.error("Download error:", error);
    return NextResponse.json(
      { message: error.message || "Failed to download images" },
      { status: 500 }
    );
  }
}
