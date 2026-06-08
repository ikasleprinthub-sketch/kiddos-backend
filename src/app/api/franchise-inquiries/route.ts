import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Store the inquiry in the dedicated FranchiseInquiry table
    await (prisma.franchiseInquiry as any).create({
      data: {
        name: body.name,
        email: body.email,
        mobile: body.mobile,
        alternate: body.alternate || null,
        preferredLocation: body.preferredLocation || null,
        hearAboutUs: body.hearAboutUs || null,
        country: body.country || null,
        state: body.state || null,
        city: body.city || null,
        zipcode: body.zipcode || body.pincode || null,
        profession: body.profession || null,
        aboutBusiness: body.aboutBusiness || null,
        package: body.package || null,
        readyToStart: body.readyToStart || null,
        message: body.message || null,
        image: body.image || null,
      },
    });

    return NextResponse.json(
      { message: "Franchise inquiry submitted successfully!" },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Franchise inquiry error:", error);
    return NextResponse.json(
      { message: error.message || "Failed to submit inquiry" },
      { status: 500 }
    );
  }
}
