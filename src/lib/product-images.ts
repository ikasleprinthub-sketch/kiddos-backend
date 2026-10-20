import { isAcceptableImageUrl } from "@/lib/uploads";

export const MAX_PRODUCT_IMAGES = 6;

/**
 * Validate the `images` array sent by the admin form: index 0 is the primary image,
 * index 1 the hover image. Returns the cleaned list or an error message.
 */
export function parseProductImages(images: unknown): { urls: string[] } | { error: string } {
  if (!Array.isArray(images)) return { error: "images must be a list of image URLs" };
  const urls = images.filter((u) => typeof u === "string" && u.trim()).map((u: string) => u.trim());
  if (urls.length !== images.length) return { error: "Image list contains an empty entry" };
  if (urls.length > MAX_PRODUCT_IMAGES) return { error: `A product can have at most ${MAX_PRODUCT_IMAGES} images` };
  if (new Set(urls).size !== urls.length) return { error: "The same image is used twice" };
  const bad = urls.find((u) => !isAcceptableImageUrl(u));
  if (bad) return { error: `Invalid image URL: ${bad}` };
  return { urls };
}

/**
 * Rows for prisma `productImage.create`. createdAt is spaced 1ms apart so ordering by
 * [isPrimary desc, createdAt asc] always returns primary first, then hover, then the rest.
 */
export function productImageRows(urls: string[]) {
  const base = Date.now();
  return urls.map((url, i) => ({ url, isPrimary: i === 0, createdAt: new Date(base + i) }));
}

// Use this orderBy wherever product images are read
export const PRODUCT_IMAGE_ORDER = [{ isPrimary: "desc" as const }, { createdAt: "asc" as const }];
