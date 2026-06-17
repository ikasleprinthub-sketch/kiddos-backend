import { NextRequest, NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import JSZip from "jszip";

/**
 * GET /api/admin/downloads/images
 *
 * Endpoint to download all uploaded images from products, categories, and banners
 * as a single ZIP file organized by type.
 *
 * Authentication: Required (Admin role only)
 * Returns: Binary ZIP file with filename pattern "images-YYYY-MM-DD.zip"
 * File structure:
 *   - products/ (all product images)
 *   - categories/ (all category images)
 *   - banners/ (all banner images)
 */
export async function GET(request: NextRequest) {
  try {
    // Check if user is authenticated and has admin role
    // Returns null if user is not authenticated or not an admin
    const admin = authorizeAdmin(request);
    if (!admin) {
      return NextResponse.json({ message: "Access denied: Admins only" }, { status: 403 });
    }

    // Create a new JSZip instance to build the ZIP archive
    const zip = new JSZip();
    // Get the upload directory path from environment variable or use default "uploads" folder
    const uploadDir = process.env.UPLOAD_DIR || join(process.cwd(), "uploads");

    // Query database for all product images with their associated product names
    const productImages = await prisma.productImage.findMany({
      include: { product: { select: { name: true } } },
    });

    // Query database for all categories that have images (exclude null/empty images)
    const categories = await prisma.category.findMany({
      where: { image: { not: null } },
      select: { id: true, name: true, image: true },
    });

    // Query database for all banners with their images
    const banners = await prisma.banner.findMany({
      select: { id: true, title: true, image: true },
    });

    // Process product images: add each image to the "products" folder in the ZIP
    if (productImages.length > 0) {
      const productsFolder = zip.folder("products");
      for (const img of productImages) {
        // Extract filename from URL path (e.g., "/uploads/products/uuid.jpg" -> "uuid.jpg")
        const filename = img.url.split("/").pop() || "image";
        // Build the full file path on the server filesystem
        const filepath = join(uploadDir, "products", filename);

        try {
          // Only process files that exist on the filesystem
          if (existsSync(filepath)) {
            // Read the image file as binary data
            const fileBuffer = readFileSync(filepath);
            // Sanitize product name for use in filename (convert to lowercase, remove special characters)
            const productName = img.product.name?.replace(/[^a-z0-9]/gi, "_").toLowerCase() || "product";
            // Add file to ZIP with a descriptive name combining product name and original filename
            productsFolder?.file(`${productName}-${filename}`, fileBuffer);
          }
        } catch (err) {
          // Log warning but don't fail entire operation if one image can't be read
          console.warn(`Failed to read product image: ${filepath}`);
        }
      }
    }

    // Process category images: add each image to the "categories" folder in the ZIP
    if (categories.length > 0) {
      const categoriesFolder = zip.folder("categories");
      for (const cat of categories) {
        // Only process categories that have an image URL
        if (cat.image) {
          // Extract filename from URL path
          const filename = cat.image.split("/").pop() || "image";
          // Build the full file path on the server filesystem
          const filepath = join(uploadDir, "categories", filename);

          try {
            // Only process files that exist on the filesystem
            if (existsSync(filepath)) {
              // Read the image file as binary data
              const fileBuffer = readFileSync(filepath);
              // Sanitize category name for use in filename
              const catName = cat.name.replace(/[^a-z0-9]/gi, "_").toLowerCase();
              // Add file to ZIP with a descriptive name combining category name and original filename
              categoriesFolder?.file(`${catName}-${filename}`, fileBuffer);
            }
          } catch (err) {
            // Log warning but don't fail entire operation if one image can't be read
            console.warn(`Failed to read category image: ${filepath}`);
          }
        }
      }
    }

    // Process banner images: add each image to the "banners" folder in the ZIP
    if (banners.length > 0) {
      const bannersFolder = zip.folder("banners");
      for (const banner of banners) {
        // Extract filename from URL path
        const filename = banner.image.split("/").pop() || "image";
        // Build the full file path on the server filesystem
        const filepath = join(uploadDir, "banners", filename);

        try {
          // Only process files that exist on the filesystem
          if (existsSync(filepath)) {
            // Read the image file as binary data
            const fileBuffer = readFileSync(filepath);
            // Sanitize banner title for use in filename, fallback to "banner" if no title
            const bannerName = (banner.title || "banner").replace(/[^a-z0-9]/gi, "_").toLowerCase();
            // Add file to ZIP with a descriptive name combining banner name and original filename
            bannersFolder?.file(`${bannerName}-${filename}`, fileBuffer);
          }
        } catch (err) {
          // Log warning but don't fail entire operation if one image can't be read
          console.warn(`Failed to read banner image: ${filepath}`);
        }
      }
    }

    // Generate the complete ZIP file as an ArrayBuffer (binary data)
    const zipBuffer = await zip.generateAsync({ type: "arraybuffer" });

    // Return the ZIP file as an HTTP response with proper headers
    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        // Set content type to ZIP file
        "Content-Type": "application/zip",
        // Set filename with today's date (e.g., "images-2026-06-17.zip")
        // This tells the browser to download the file with this filename
        "Content-Disposition": `attachment; filename="images-${new Date().toISOString().split("T")[0]}.zip"`,
      },
    });
  } catch (error: any) {
    // Log the full error for debugging purposes
    console.error("Download error:", error);
    // Return a user-friendly error message to the client
    return NextResponse.json(
      { message: error.message || "Failed to download images" },
      { status: 500 }
    );
  }
}
