import { NextRequest, NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = authorizeAdmin(request);
  if (!admin) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  try {
    const existing = await prisma.franchiseDownload.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: "Download lead not found" }, { status: 404 });

    await prisma.franchiseDownload.delete({ where: { id } });

    return NextResponse.json({ message: "Download lead deleted successfully" });
  } catch (error: any) {
    console.error("Failed to delete download lead:", error);
    return NextResponse.json(
      { message: error.message || "Failed to delete download lead" },
      { status: 500 }
    );
  }
}
