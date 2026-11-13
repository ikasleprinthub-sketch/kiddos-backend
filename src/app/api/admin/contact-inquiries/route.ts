import { NextRequest, NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parsePagination } from "@/lib/pagination";

export async function GET(request: NextRequest) {
  const admin = await authorizeAdmin(request);
  if (!admin) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const { page, limit, skip } = parsePagination(searchParams, { defaultLimit: 20, maxLimit: 200 });
  const search = (searchParams.get("search") || "").trim();
  const status = searchParams.get("status") || "";

  const where: Record<string, unknown> = {};
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { subject: { contains: search, mode: "insensitive" } },
    ];
  }
  if (status) where.status = status;

  try {
    const [total, inquiries] = await Promise.all([
      prisma.contactInquiry.count({ where }),
      prisma.contactInquiry.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
    ]);

    return NextResponse.json({ inquiries, total, pages: Math.ceil(total / limit) });
  } catch (error) {
    console.error("[admin/contact-inquiries GET]", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
