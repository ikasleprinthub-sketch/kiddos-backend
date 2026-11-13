import { NextRequest, NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildCatalogueZip, catalogJson, categoriesCsv, loadCatalogue, productsCsv, variantsCsv } from "@/lib/catalog-export";

/**
 * GET /api/admin/export — bulk download of the whole catalogue (admin only).
 *
 *   ?file=summary     → JSON counts for the Bulk Download page
 *   ?file=all         → ZIP: products.csv, product-variants.csv, categories.csv, catalog.json
 *                       (+ images/ when &images=1)
 *   ?file=products    → products.csv         (one row per product, every field)
 *   ?file=variants    → product-variants.csv (one row per size/option)
 *   ?file=categories  → categories.csv
 *   ?file=json        → catalog.json         (full backup: categories + products with variants and images)
 *
 * Includes inactive products and categories too, so the download is a complete copy of the catalogue.
 */
export async function GET(request: NextRequest) {
  const admin = await authorizeAdmin(request);
  if (!admin) return NextResponse.json({ message: "Access denied: Admins only" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const file = searchParams.get("file") || "all";
  const stamp = new Date().toISOString().slice(0, 10);

  try {
    if (file === "summary") {
      const [products, activeProducts, categories, variants, images] = await Promise.all([
        prisma.product.count(),
        prisma.product.count({ where: { isActive: true } }),
        prisma.category.count(),
        prisma.productVariant.count(),
        prisma.productImage.count(),
      ]);
      return NextResponse.json({ products, activeProducts, categories, variants, images });
    }

    if (file === "all") {
      const zip = await buildCatalogueZip(searchParams.get("images") === "1");
      return fileResponse(zip, "application/zip", `kiddos-catalogue-${stamp}.zip`);
    }

    const { categories, products } = await loadCatalogue();
    switch (file) {
      case "products":
        return fileResponse(productsCsv(products), "text/csv; charset=utf-8", `products-${stamp}.csv`);
      case "variants":
        return fileResponse(variantsCsv(products), "text/csv; charset=utf-8", `product-variants-${stamp}.csv`);
      case "categories":
        return fileResponse(categoriesCsv(categories), "text/csv; charset=utf-8", `categories-${stamp}.csv`);
      case "json":
        return fileResponse(JSON.stringify(catalogJson(categories, products), null, 2), "application/json", `catalog-${stamp}.json`);
      default:
        return NextResponse.json({ message: "Unknown export file" }, { status: 400 });
    }
  } catch (error) {
    console.error("[admin/export]", (error as Error).message);
    return NextResponse.json({ message: "Could not prepare the download. Please try again." }, { status: 500 });
  }
}

function fileResponse(body: string | ArrayBuffer, type: string, filename: string) {
  return new NextResponse(body, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
