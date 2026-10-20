import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isUploadUrl } from "@/lib/uploads";
import { isValidEmail, sendAdminFormEmail } from "@/services/email.service";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ message: "Name is required" }, { status: 400 });
    }
    if (!/^[a-zA-Z][a-zA-Z\s.]{1,99}$/.test(body.name.trim())) {
      return NextResponse.json({ message: "Name may contain only letters and spaces" }, { status: 400 });
    }
    if (!isValidEmail(typeof body.email === "string" ? body.email.trim() : "")) {
      return NextResponse.json({ message: "Enter a valid email address" }, { status: 400 });
    }
    if (typeof body.mobile !== "string" || !body.mobile.trim()) {
      return NextResponse.json({ message: "Mobile number is required" }, { status: 400 });
    }

    // The optional photo must be one uploaded through /api/upload (folder "franchises"), not an arbitrary URL
    if (body.image && !isUploadUrl(body.image, "franchises")) {
      return NextResponse.json({ message: "Invalid image. Please upload the photo again." }, { status: 400 });
    }

    // Store the inquiry in the dedicated FranchiseInquiry table
    const inquiry = await (prisma.franchiseInquiry as any).create({
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

    // Saved already: a mail problem is logged inside and never changes the response
    void sendAdminFormEmail({
      formName: "Franchise Inquiry",
      submissionId: inquiry.id,
      submittedAt: inquiry.createdAt,
      replyTo: inquiry.email,
      fields: [
        { label: "Name", value: inquiry.name },
        { label: "Email", value: inquiry.email },
        { label: "Mobile", value: inquiry.mobile },
        { label: "Alternate Mobile", value: inquiry.alternate },
        { label: "Preferred Location", value: inquiry.preferredLocation },
        { label: "Heard About Us Via", value: inquiry.hearAboutUs },
        { label: "Country", value: inquiry.country },
        { label: "State", value: inquiry.state },
        { label: "City", value: inquiry.city },
        { label: "Pincode", value: inquiry.zipcode },
        { label: "Profession", value: inquiry.profession },
        { label: "About Business", value: inquiry.aboutBusiness },
        { label: "Package", value: inquiry.package },
        { label: "Ready To Start", value: inquiry.readyToStart },
        { label: "Message", value: inquiry.message },
        { label: "Uploaded Image", value: inquiry.image },
      ],
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
