import { NextRequest, NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { getUploadRoot, isUploadFolder, detectImageType } from "@/lib/uploads";
import { consumeRateLimit, trustedClientIp } from "@/lib/rate-limit";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// Public (non-admin) uploads are only allowed for the franchise form. They are rate limited in PostgreSQL
// (shared by all instances, survives restarts): per client, plus a global cap on all anonymous uploads so
// rotating IPs can't fill the disk. Limits are configurable; defaults suit a low-volume inquiry form.
const PUBLIC_FOLDER = "franchises";
const PER_CLIENT_LIMIT = Number(process.env.FRANCHISE_UPLOAD_LIMIT_PER_CLIENT) || 10; // per 15 minutes
const PER_CLIENT_WINDOW_S = 15 * 60;
const GLOBAL_LIMIT = Number(process.env.FRANCHISE_UPLOAD_LIMIT_GLOBAL) || 100; // per hour, all anonymous users
const GLOBAL_WINDOW_S = 60 * 60;

/** null = allowed; otherwise the response to send */
async function checkPublicUploadLimits(request: NextRequest): Promise<NextResponse | null> {
  // Without a trusted proxy we can't identify clients, so all anonymous uploads share one bucket
  const client = trustedClientIp(request) ?? "untrusted";
  try {
    const perClientOk = await consumeRateLimit(`upload:franchise:client:${client}`, PER_CLIENT_LIMIT, PER_CLIENT_WINDOW_S);
    const globalOk = perClientOk && (await consumeRateLimit("upload:franchise:global", GLOBAL_LIMIT, GLOBAL_WINDOW_S));
    if (!perClientOk || !globalOk) {
      return NextResponse.json(
        { message: "Too many uploads. Please try again later." },
        { status: 429, headers: { "Retry-After": String(perClientOk ? GLOBAL_WINDOW_S : PER_CLIENT_WINDOW_S) } }
      );
    }
    return null;
  } catch (error) {
    // If rate limiting check fails unexpectedly, log the error and allow the upload so
    // legitimate applicants are not blocked from uploading location photos.
    console.error("Upload rate limit check failed:", error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  // Reject oversized bodies before parsing them
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_FILE_SIZE + 64 * 1024) {
    return NextResponse.json({ message: "File size must be under 5MB" }, { status: 413 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ message: "Invalid upload request" }, { status: 400 });
  }
  const file = formData.get("file");
  const folder = formData.get("folder") || "general";

  if (!isUploadFolder(folder)) {
    return NextResponse.json({ message: "Invalid upload folder" }, { status: 400 });
  }

  // Allow public uploads only for the franchises folder, otherwise require admin auth
  const admin = authorizeAdmin(request);
  if (!admin) {
    if (folder !== PUBLIC_FOLDER) {
      return NextResponse.json({ message: "Access denied: Admins only" }, { status: 403 });
    }
    const limited = await checkPublicUploadLimits(request);
    if (limited) return limited;
  }

  if (!(file instanceof File)) return NextResponse.json({ message: "No file provided" }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ message: "The file is empty" }, { status: 400 });
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ message: "File size must be under 5MB" }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Trust the file's bytes, not its name or declared type; the stored extension comes from the content
  const detected = detectImageType(buffer);
  if (!detected) {
    return NextResponse.json(
      { message: "Only JPEG, PNG, WebP, and GIF images are allowed" },
      { status: 400 }
    );
  }

  const filename = `${randomUUID()}${detected.ext}`;
  const uploadPath = join(/*turbopackIgnore: true*/ getUploadRoot(), folder);

  try {
    await mkdir(uploadPath, { recursive: true });
    await writeFile(join(/*turbopackIgnore: true*/ uploadPath, filename), buffer, { flag: "wx" });
  } catch (error) {
    console.error("Upload write error:", error);
    return NextResponse.json({ message: "Could not save the file on the server" }, { status: 500 });
  }

  // Relative URL: served by /uploads/[...path] and proxied by the frontend, so no host is baked into the DB
  const url = `/uploads/${folder}/${filename}`;

  return NextResponse.json({ url, filename, folder }, { status: 201 });
}
