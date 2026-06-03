import { NextRequest, NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import { join, extname } from "path";
import { randomUUID } from "crypto";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "C:\\Users\\Administrator\\Documents\\KiddosFood\\uploads";
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export async function POST(request: NextRequest) {
  const admin = authorizeAdmin(request);
  if (!admin) return NextResponse.json({ message: "Access denied: Admins only" }, { status: 403 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const folder = (formData.get("folder") as string) || "general";

  if (!file) return NextResponse.json({ message: "No file provided" }, { status: 400 });
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { message: "Only JPEG, PNG, WebP, and GIF images are allowed" },
      { status: 400 }
    );
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ message: "File size must be under 5MB" }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const ext = extname(file.name) || ".jpg";
  const filename = `${randomUUID()}${ext}`;
  const uploadPath = join(UPLOAD_DIR, folder);

  await mkdir(uploadPath, { recursive: true });
  await writeFile(join(uploadPath, filename), buffer);

  const url = `/uploads/${folder}/${filename}`;

  return NextResponse.json({ url, filename, folder }, { status: 201 });
}
