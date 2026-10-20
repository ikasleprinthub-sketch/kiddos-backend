import { isAcceptableImageUrl } from "@/lib/uploads";

export const BANNER_POSITIONS = ["HOME", "PROMO", "CATEGORY", "PRODUCT", "CHECKOUT"] as const;
export type BannerPosition = (typeof BANNER_POSITIONS)[number];

export function isBannerPosition(value: unknown): value is BannerPosition {
  return typeof value === "string" && (BANNER_POSITIONS as readonly string[]).includes(value);
}

// Empty / whitespace text is stored as null, the same way on create and update
function optionalText(value: unknown, field: string, max: number): { value: string | null } | { error: string } {
  if (value === null || value === undefined) return { value: null };
  if (typeof value !== "string") return { error: `${field} must be text` };
  const trimmed = value.trim();
  if (trimmed.length > max) return { error: `${field} must be at most ${max} characters` };
  return { value: trimmed || null };
}

/**
 * Validate a banner body. With `partial` (PUT) only the fields present are checked and returned;
 * otherwise (POST) image is required and defaults are applied.
 */
export function parseBannerInput(body: unknown, partial: boolean): { data: Record<string, unknown> } | { error: string } {
  if (!body || typeof body !== "object") return { error: "Invalid request body" };
  const b = body as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  const has = (k: string) => !partial || b[k] !== undefined;

  for (const [key, label, max] of [["title", "Title", 120], ["subtitle", "Subtitle", 200]] as const) {
    if (!has(key)) continue;
    const r = optionalText(b[key], label, max);
    if ("error" in r) return r;
    data[key] = r.value;
  }

  if (has("image")) {
    const image = typeof b.image === "string" ? b.image.trim() : "";
    if (!image) return { error: "Banner image is required" };
    if (!isAcceptableImageUrl(image)) return { error: "Banner image must be an uploaded image or an https URL" };
    data.image = image;
  }

  if (has("link")) {
    const r = optionalText(b.link, "Link", 500);
    if ("error" in r) return r;
    const link = r.value;
    // Same-site path ("/products") or a full http(s) URL; nothing else (e.g. javascript:)
    if (link && !(/^\/(?!\/)/.test(link) || /^https?:\/\/[^\s]+$/i.test(link))) {
      return { error: 'Link must start with "/" (e.g. /products) or be a full http(s) URL' };
    }
    data.link = link;
  }

  if (has("isActive")) {
    if (b.isActive === undefined) data.isActive = true;
    else if (typeof b.isActive !== "boolean") return { error: "isActive must be true or false" };
    else data.isActive = b.isActive;
  }

  if (has("sortOrder")) {
    const n = b.sortOrder === undefined || b.sortOrder === "" ? 0 : Number(b.sortOrder);
    if (!Number.isInteger(n) || n < 0 || n > 9999) return { error: "Sort order must be a whole number from 0 to 9999" };
    data.sortOrder = n;
  }

  if (has("position")) {
    const position = b.position === undefined ? "HOME" : b.position;
    if (!isBannerPosition(position)) return { error: "Invalid banner position" };
    data.position = position;
  }

  return { data };
}
