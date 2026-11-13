import { readFile } from "fs/promises";
import JSZip from "jszip";
import { prisma } from "@/lib/prisma";
import { PRODUCT_IMAGE_ORDER } from "@/lib/product-images";
import { resolveUploadFile } from "@/lib/uploads";

/** Catalogue export for the admin "Bulk Download" page (see /api/admin/export). */

export async function loadCatalogue() {
  const [categories, products] = await Promise.all([
    prisma.category.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { products: true } } },
    }),
    prisma.product.findMany({
      orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
      include: {
        category: { select: { id: true, name: true, slug: true } },
        images: { orderBy: PRODUCT_IMAGE_ORDER },
        variants: { orderBy: { createdAt: "asc" } },
      },
    }),
  ]);
  return { categories, products };
}

type Categories = Awaited<ReturnType<typeof loadCatalogue>>["categories"];
type Products = Awaited<ReturnType<typeof loadCatalogue>>["products"];

/** Stored image paths are relative (/uploads/...); make them full links using the site address. */
function absoluteUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  const site = (process.env.FRONTEND_URL || "").replace(/\/+$/, "");
  return site ? `${site}${url}` : url;
}

const num = (v: unknown) => (v === null || v === undefined ? "" : String(Number(v)));
const yesNo = (v: boolean) => (v ? "Yes" : "No");
const date = (d: Date) => d.toISOString();
const sizeLabel = (weight: unknown, unit: string | null) => (weight != null ? `${Number(weight)}${unit ? " " + unit : ""}` : unit || "");

export function productsCsv(products: Products): string {
  const header = [
    "Product ID", "Name", "Slug", "SKU", "Category", "Category Slug",
    "Price", "Sale Price", "Stock", "Weight", "Unit",
    "Active", "Featured", "Popular Batter", "Spices & Oils", "Offer", "Combo",
    "Tags", "Description", "Ingredients", "Health Benefits", "Usage Instructions", "Storage Instructions", "Shelf Life",
    "Nutrient Facts", "Variant Count", "Variants", "Image Count", "Primary Image", "All Images",
    "Created At", "Updated At",
  ];
  const rows = products.map((p) => [
    p.id, p.name ?? "", p.slug, p.sku ?? "", p.category.name, p.category.slug,
    num(p.price), num(p.salePrice), String(p.stock), num(p.weight), p.unit ?? "",
    yesNo(p.isActive), yesNo(p.isFeatured), yesNo(p.isPopularBatter), yesNo(p.isSpiceOil), yesNo(p.isOffer), yesNo(p.isCombo),
    p.tags.join(", "), p.description ?? "", p.ingredients ?? "", p.healthBenefits ?? "", p.usageInstructions ?? "",
    p.storageInstructions ?? "", p.shelfLife ?? "",
    p.nutrientFacts ? JSON.stringify(p.nutrientFacts) : "",
    String(p.variants.length),
    p.variants
      .map((v) => `${sizeLabel(v.weight, v.unit)}: ₹${Number(v.price)}${v.salePrice != null ? ` → ₹${Number(v.salePrice)}` : ""}, stock ${v.stock}${v.isActive ? "" : " (inactive)"}`)
      .join(" | "),
    String(p.images.length),
    absoluteUrl(p.images.find((i) => i.isPrimary)?.url ?? p.images[0]?.url),
    p.images.map((i) => absoluteUrl(i.url)).join(" | "),
    date(p.createdAt), date(p.updatedAt),
  ]);
  return toCsv([header, ...rows]);
}

export function variantsCsv(products: Products): string {
  const header = ["Product ID", "Product Name", "Product SKU", "Category", "Variant ID", "Size", "Weight", "Unit", "Price", "Sale Price", "Stock", "Variant SKU", "Active"];
  const rows = products.flatMap((p) =>
    p.variants.map((v) => [
      p.id, p.name ?? "", p.sku ?? "", p.category.name, v.id, sizeLabel(v.weight, v.unit), num(v.weight), v.unit ?? "",
      num(v.price), num(v.salePrice), String(v.stock), v.sku ?? "", yesNo(v.isActive),
    ])
  );
  return toCsv([header, ...rows]);
}

export function categoriesCsv(categories: Categories): string {
  const header = ["Category ID", "Name", "Slug", "Description", "Image", "Active", "Sort Order", "Product Count", "Created At", "Updated At"];
  const rows = categories.map((c) => [
    c.id, c.name, c.slug, c.description ?? "", absoluteUrl(c.image), yesNo(c.isActive), String(c.sortOrder),
    String(c._count.products), date(c.createdAt), date(c.updatedAt),
  ]);
  return toCsv([header, ...rows]);
}

export function catalogJson(categories: Categories, products: Products) {
  return {
    exportedAt: new Date().toISOString(),
    counts: { categories: categories.length, products: products.length, variants: products.reduce((n, p) => n + p.variants.length, 0) },
    categories: categories.map(({ _count, ...c }) => ({ ...c, image: absoluteUrl(c.image), productCount: _count.products })),
    products: products.map((p) => ({
      ...p,
      price: p.price != null ? Number(p.price) : null,
      salePrice: p.salePrice != null ? Number(p.salePrice) : null,
      weight: p.weight != null ? Number(p.weight) : null,
      images: p.images.map((i) => ({ url: absoluteUrl(i.url), isPrimary: i.isPrimary })),
      variants: p.variants.map((v) => ({
        ...v,
        price: Number(v.price),
        salePrice: v.salePrice != null ? Number(v.salePrice) : null,
        weight: v.weight != null ? Number(v.weight) : null,
      })),
    })),
  };
}

/** Copy uploaded image files into the ZIP: images/products/<product-slug>-N.ext, images/categories/<slug>.ext */
export async function addImages(zip: JSZip, categories: Categories, products: Products) {
  let added = 0;
  let missing = 0;
  const add = async (url: string | null, target: string) => {
    const m = url ? /^\/uploads\/(.+)$/.exec(url) : null;
    const path = m ? await resolveUploadFile(m[1].split("/")) : null; // safe: stays inside the upload folder
    if (!path) { if (url) missing++; return; }
    const ext = path.slice(path.lastIndexOf("."));
    zip.file(`${target}${ext}`, await readFile(path));
    added++;
  };
  for (const c of categories) await add(c.image, `images/categories/${c.slug}`);
  for (const p of products) {
    for (const [i, img] of p.images.entries()) {
      await add(img.url, `images/products/${p.slug}${p.images.length > 1 ? `-${i + 1}` : ""}${img.isPrimary ? "-main" : ""}`);
    }
  }
  return { added, missing };
}

export function readme(categoryCount: number, productCount: number, imageNote: string) {
  return [
    "Kiddos Foods — catalogue export",
    `Exported: ${new Date().toISOString()}`,
    "",
    `categories.csv        ${categoryCount} categories (all fields)`,
    `products.csv          ${productCount} products (all fields; variants and image links summarised per row)`,
    "product-variants.csv  one row per size/option of each product",
    "catalog.json          complete backup of categories and products, including variants and images",
    "",
    imageNote,
    "",
    "The CSV files open directly in Excel or Google Sheets.",
  ].join("\r\n");
}

// Excel treats cells that start with = + - @ as formulas; prefix them so data can't run as a formula
function toCsv(rows: string[][]): string {
  const cell = (v: string) => {
    const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  // BOM so Excel shows ₹ and Tamil text correctly
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
}

/** Everything in one ZIP: the three CSV files, the JSON backup, a README and (optionally) the image files. */
export async function buildCatalogueZip(withImages: boolean): Promise<ArrayBuffer> {
  const { categories, products } = await loadCatalogue();
  const zip = new JSZip();
  zip.file("products.csv", productsCsv(products));
  zip.file("product-variants.csv", variantsCsv(products));
  zip.file("categories.csv", categoriesCsv(categories));
  zip.file("catalog.json", JSON.stringify(catalogJson(categories, products), null, 2));
  let imageNote = "Images were not included (tick 'Include images' to add them).";
  if (withImages) {
    const { added, missing } = await addImages(zip, categories, products);
    imageNote = `${added} image file(s) included in images/.${missing ? ` ${missing} image(s) are external links or missing on the server; their URLs are in the CSV files.` : ""}`;
  }
  zip.file("README.txt", readme(categories.length, products.length, imageNote));
  return zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });
}
