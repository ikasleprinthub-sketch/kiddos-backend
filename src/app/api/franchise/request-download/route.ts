import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isValidEmail, sendEmail } from "@/services/email.service";
import { isValidMobile, isValidName } from "@/lib/validation";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, mobile, resource } = body;

    // 1. Basic validation
    if (!name || !email || !mobile || !resource) {
      return NextResponse.json(
        { message: "Missing required fields: name, email, mobile, resource" },
        { status: 400 }
      );
    }

    if (!isValidName(name)) {
      return NextResponse.json({ message: "Please enter a valid full name." }, { status: 400 });
    }
    if (!isValidEmail(typeof email === "string" ? email.trim() : "")) {
      return NextResponse.json({ message: "Please enter a valid email address." }, { status: 400 });
    }
    if (!isValidMobile(mobile)) {
      return NextResponse.json({ message: "Please enter a valid 10-digit mobile number." }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedResource = String(resource).toUpperCase(); // "BROCHURE" or "APPLICATION_FORM"

    if (normalizedResource !== "BROCHURE" && normalizedResource !== "APPLICATION_FORM") {
      return NextResponse.json(
        { message: "Invalid resource type. Must be 'BROCHURE' or 'APPLICATION_FORM'." },
        { status: 400 }
      );
    }

    // 2. Generate 6-digit numeric OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

    // Delete any old download verification OTPs for this email to avoid clutter
    await prisma.oTP.deleteMany({
      where: {
        email: normalizedEmail,
        type: "DOWNLOAD_VERIFICATION",
      },
    });

    // Save the OTP with lead details in tempData
    await prisma.oTP.create({
      data: {
        email: normalizedEmail,
        otp,
        type: "DOWNLOAD_VERIFICATION",
        expiresAt,
        tempData: {
          name: name.trim(),
          mobile: mobile.trim(),
          resource: normalizedResource,
        },
      },
    });

    // 3. Send OTP Email
    const htmlContent = `
      <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 8px;">
        <h2 style="color: #4CAF50; text-align: center;">Kiddos Food</h2>
        <p>Hi ${name},</p>
        <p>Thank you for your interest in Kiddos Food Franchise resources. Please use the following One-Time Password (OTP) to verify your request and download your document:</p>
        <div style="background-color: #f9f9f9; border: 1px dashed #ccc; padding: 15px; font-size: 24px; font-weight: bold; text-align: center; letter-spacing: 5px; margin: 20px 0; color: #333;">
          ${otp}
        </div>
        <p style="font-size: 0.9em; color: #666;">This OTP is valid for 10 minutes. Please do not share it with anyone.</p>
      </div>
    `;

    await sendEmail(normalizedEmail, "Verify Your Request - Kiddos Food", htmlContent);

    return NextResponse.json(
      { message: "OTP sent successfully. Please check your email." },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Request download error:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
