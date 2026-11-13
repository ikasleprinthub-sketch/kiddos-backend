import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isUploadUrl } from "@/lib/uploads";
import { isValidMobile } from "@/lib/validation";
import { isValidEmail, sendAdminFormEmail } from "@/services/email.service";
import { limitEmailSends } from "@/lib/otp";

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
    if (!isValidMobile(body.mobile)) {
      return NextResponse.json({ message: "Enter a valid 10-digit mobile number" }, { status: 400 });
    }

    // Normalize image if sent as a full URL (e.g., http://localhost:5050/uploads/franchises/...)
    let image = typeof body.image === "string" ? body.image.trim() : null;
    if (image) {
      if (image.startsWith("http://") || image.startsWith("https://")) {
        try {
          image = new URL(image).pathname;
        } catch {
          // ignore parsing error
        }
      }
    }

    // The optional photo must be one uploaded through /api/upload (folder "franchises"), not an arbitrary URL
    if (image && !isUploadUrl(image, "franchises")) {
      return NextResponse.json({ message: "Invalid image. Please upload the photo again." }, { status: 400 });
    }

    // Ensure appropriate initial status (default PENDING for Admin Panel -> Franchise Leads)
    const initialStatus = typeof body.status === "string" && ["NEW", "PENDING", "CONTACTED"].includes(body.status.toUpperCase())
      ? body.status.toUpperCase()
      : "PENDING";

    const inquiryData = {
      name: body.name.trim(),
      email: body.email.trim(),
      mobile: body.mobile.trim(),
      alternate: typeof body.alternate === "string" ? body.alternate.trim() || null : null,
      preferredLocation: typeof body.preferredLocation === "string" ? body.preferredLocation.trim() || null : null,
      hearAboutUs: typeof body.hearAboutUs === "string" ? body.hearAboutUs.trim() || null : null,
      country: typeof body.country === "string" ? body.country.trim() || null : null,
      state: typeof body.state === "string" ? body.state.trim() || null : null,
      city: typeof body.city === "string" ? body.city.trim() || null : null,
      zipcode: typeof body.zipcode === "string" ? body.zipcode.trim() || null : (typeof body.pincode === "string" ? body.pincode.trim() || null : null),
      profession: typeof body.profession === "string" ? body.profession.trim() || null : null,
      aboutBusiness: typeof body.aboutBusiness === "string" ? body.aboutBusiness.trim() || null : null,
      package: typeof body.package === "string" ? body.package.trim() || null : null,
      readyToStart: typeof body.readyToStart === "string" ? body.readyToStart.trim() || null : null,
      message: typeof body.message === "string" ? body.message.trim() || null : null,
      image: image || null,
      status: initialStatus as any,
    };

    // Free-text fields are stored and emailed, so cap their size
    if (Object.values(inquiryData).some((v) => typeof v === "string" && v.length > 2000)) {
      return NextResponse.json({ message: "One or more fields are too long" }, { status: 400 });
    }

    const limited = await limitEmailSends(request, "franchise", inquiryData.email.toLowerCase());
    if (limited) return limited;

    // Schema changes belong in prisma/migrations, never in request handlers
    const inquiry = await prisma.franchiseInquiry.create({
      data: inquiryData,
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
      { message: "Failed to submit inquiry. Please try again." },
      { status: 500 }
    );
  }
}
