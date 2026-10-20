import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import { extname } from "path";
import { resolveUploadFile, SERVABLE_TYPES } from "@/lib/uploads";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  if (!path || path.length === 0) {
    return new NextResponse("Not Found", { status: 404 });
  }

  // Only image types we upload are served (no HTML/SVG that could run script on our origin)
  const contentType = SERVABLE_TYPES[extname(path[path.length - 1]).toLowerCase()];
  if (!contentType) {
    return new NextResponse("Not Found", { status: 404 });
  }

  // Resolves inside UPLOAD_DIR or returns null for traversal attempts / missing files
  const filePath = await resolveUploadFile(path);
  if (!filePath) {
    return new NextResponse("Not Found", { status: 404 });
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) return new NextResponse("Not Found", { status: 404 });

    const fileBuffer = await readFile(filePath);
    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(info.size),
        // File names are random UUIDs and never overwritten, so they can be cached forever
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    console.error("Error reading upload:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
