import { NextRequest, NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parsePagination } from "@/lib/pagination";

export async function GET(request: NextRequest) {
  const admin = await authorizeAdmin(request);
  if (!admin) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const { page, limit, skip } = parsePagination(searchParams, { defaultLimit: 10, maxLimit: 200 });
  const search = (searchParams.get("search") || "").toLowerCase().trim();

  try {
    const whereClause = search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
            { mobile: { contains: search, mode: "insensitive" as const } },
            { resource: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {};

    const [total, downloads] = await Promise.all([
      prisma.franchiseDownload.count({ where: whereClause }),
      prisma.franchiseDownload.findMany({
        where: whereClause,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
    ]);

    const pages = Math.ceil(total / limit);

    return NextResponse.json({
      downloads,
      total,
      pages,
    });
  } catch (error: any) {
    console.error("Failed to fetch franchise downloads:", error);
    return NextResponse.json(
      { message: "Failed to fetch franchise downloads" },
      { status: 500 }
    );
  }
}
