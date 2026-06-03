import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join, extname } from "path";
import { existsSync } from "fs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  if (!path || path.length === 0) {
    return new NextResponse("Not Found", { status: 404 });
  }

  // Base directory for uploads
  const UPLOAD_DIR = process.env.UPLOAD_DIR || "C:\\Users\\Administrator\\Documents\\KiddosFood\\uploads";
  
  // Construct the resolved path
  const relativePath = join(...path);
  const filePath = join(UPLOAD_DIR, relativePath);

  // Security check to prevent directory traversal
  // Make sure the resolved path is inside UPLOAD_DIR
  if (!filePath.startsWith(UPLOAD_DIR)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  if (!existsSync(filePath)) {
    return new NextResponse("Not Found", { status: 404 });
  }

  try {
    const fileBuffer = await readFile(filePath);
    
    // Determine the Content-Type
    const ext = extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
      ".gif": "image/gif",
      ".svg": "image/svg+xml",
    };
    const contentType = mimeTypes[ext] || "application/octet-stream";

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("Error reading file:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
