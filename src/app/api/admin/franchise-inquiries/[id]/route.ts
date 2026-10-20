import { NextRequest, NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const LEAD_STATUSES = ["NEW", "PENDING", "CONTACTED"] as const;

// Update the lead status shown on the admin Franchise Leads page
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = authorizeAdmin(request);
  if (!admin) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const status = typeof body?.status === "string" ? body.status.toUpperCase() : "";
  if (!(LEAD_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ message: "Status must be New, Pending or Contacted" }, { status: 400 });
  }

  try {
    const existing = await prisma.franchiseInquiry.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: "Inquiry not found" }, { status: 404 });

    const inquiry = await prisma.franchiseInquiry.update({
      where: { id },
      data: { status: status as (typeof LEAD_STATUSES)[number] },
    });
    return NextResponse.json({ inquiry });
  } catch (error) {
    console.error("Failed to update franchise inquiry status:", error);
    return NextResponse.json({ message: "Failed to update inquiry status" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = authorizeAdmin(request);
  if (!admin) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  try {
    const existing = await prisma.franchiseInquiry.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: "Inquiry not found" }, { status: 404 });

    await prisma.franchiseInquiry.delete({ where: { id } });

    return NextResponse.json({ message: "Inquiry deleted successfully" });
  } catch (error: any) {
    console.error("Failed to delete franchise inquiry:", error);
    return NextResponse.json(
      { message: error.message || "Failed to delete franchise inquiry" },
      { status: 500 }
    );
  }
}
