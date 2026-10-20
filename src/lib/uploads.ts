import path from "path";
import { realpath } from "fs/promises";

/**
 * Single source of truth for where uploaded files live.
 *
 * UPLOAD_DIR may be absolute (production: /var/www/kiddosfoods/uploads) or relative to the
 * project root (local: ./uploads). It is always resolved to an absolute, platform-native path,
 * so writing (/api/upload) and serving (/uploads/...) can never disagree about the location.
 */
export function getUploadRoot(): string {
  const configured = process.env.UPLOAD_DIR?.trim();
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), configured || "uploads");
}

// Folders the app is allowed to write into (anything else is rejected, so a client can't pick a path)
export const UPLOAD_FOLDERS = ["products", "banners", "categories", "chutney-book", "franchises", "general"] as const;
export type UploadFolder = (typeof UPLOAD_FOLDERS)[number];

export function isUploadFolder(value: unknown): value is UploadFolder {
  return typeof value === "string" && (UPLOAD_FOLDERS as readonly string[]).includes(value);
}

// Extensions we serve, with their content types (.jfif is how Windows saves some JPEGs)
export const SERVABLE_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".jfif": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function isInside(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/**
 * Map URL path segments (from /uploads/[...path]) to an absolute file path inside the upload root.
 * Returns null for anything that could escape the root: "..", empty segments, separators,
 * drive letters / NTFS streams (":"), NUL bytes, or symlinks pointing outside.
 */
export async function resolveUploadFile(segments: string[]): Promise<string | null> {
  if (segments.length === 0) return null;
  for (const s of segments) {
    if (!s || s === "." || s === ".." || /[\\/:\0]/.test(s)) return null;
  }

  const root = getUploadRoot();
  const target = path.resolve(/*turbopackIgnore: true*/ root, ...segments);
  if (!isInside(root, target)) return null;

  // Follow symlinks and re-check, so a link inside the folder can't expose other files
  try {
    const [realRoot, realTarget] = await Promise.all([realpath(root), realpath(target)]);
    if (!isInside(realRoot, realTarget)) return null;
    return realTarget;
  } catch {
    return null; // missing file or root
  }
}

/** Detect the real image type from the file's first bytes (the client's MIME type and name can't be trusted). */
export function detectImageType(buf: Buffer): { ext: string; mime: string } | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: ".jpg", mime: "image/jpeg" };
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: ".png", mime: "image/png" };
  if (buf.length >= 6 && ["GIF87a", "GIF89a"].includes(buf.subarray(0, 6).toString("ascii"))) return { ext: ".gif", mime: "image/gif" };
  if (buf.length >= 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return { ext: ".webp", mime: "image/webp" };
  return null;
}

/** True for a URL our upload endpoint could have produced, e.g. /uploads/products/<uuid>.png */
export function isUploadUrl(value: unknown, folder?: UploadFolder): value is string {
  if (typeof value !== "string") return false;
  const m = /^\/uploads\/([a-z-]+)\/[A-Za-z0-9-]+\.(jpe?g|jfif|png|webp|gif)$/.exec(value);
  return !!m && isUploadFolder(m[1]) && (!folder || m[1] === folder);
}

/**
 * Validate an optional single-image field from a request body.
 * undefined → field not sent (leave unchanged); null / "" → clear it; otherwise must pass isAcceptableImageUrl.
 */
export function parseOptionalImage(value: unknown): { value: string | null | undefined } | { error: string } {
  if (value === undefined) return { value: undefined };
  if (value === null || (typeof value === "string" && !value.trim())) return { value: null };
  if (!isAcceptableImageUrl(typeof value === "string" ? value.trim() : value)) {
    return { error: "Image must be an uploaded image (/uploads/...) or an https URL" };
  }
  return { value: (value as string).trim() };
}

/** Accept our own uploads or an absolute https URL (e.g. a CDN image an admin pasted). */
export function isAcceptableImageUrl(value: unknown): value is string {
  if (isUploadUrl(value)) return true;
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
