import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { isValidEmail, sendEmail } from "@/services/email.service";
import { isValidMobile } from "@/lib/validation";
import { escapeHtml, generateOtp, limitEmailSends } from "@/lib/otp";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // Never read a role from the request: public sign-up always creates a USER.
    // Admin accounts are created only by an existing admin / the seed script.
    const { name, email, password, phone } = body;

    // 1. Basic validation
    if (!name || !email || !password || !phone) {
      return NextResponse.json(
        { message: "Missing required fields: name, email, password, phone" },
        { status: 400 }
      );
    }

    if (typeof name !== "string" || typeof email !== "string" || typeof password !== "string" || typeof phone !== "string") {
      return NextResponse.json({ message: "Invalid request" }, { status: 400 });
    }

    if (!isValidMobile(phone)) {
      return NextResponse.json(
        { message: "Please enter a valid 10-digit mobile number" },
        { status: 400 }
      );
    }

    if (!isValidEmail(email.trim()) || !name.trim() || name.length > 100) {
      return NextResponse.json({ message: "Please enter a valid name and email address" }, { status: 400 });
    }

    if (password.length < 8 || password.length > 128) {
      return NextResponse.json(
        { message: "Password must be at least 8 characters long" },
        { status: 400 }
      );
    }

    const limited = await limitEmailSends(request, "signup", email.trim().toLowerCase());
    if (limited) return limited;

    // 2. Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      return NextResponse.json(
        { message: "Email is already registered" },
        { status: 400 }
      );
    }

    // 3. Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 4. Public sign-ups are always customers
    const finalRole = "USER" as const;

    // 5. Generate 6-digit numeric OTP (crypto-secure)
    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

    const normalizedEmail = email.toLowerCase();

    // Delete any old registration OTPs for this email to avoid clutter
    await prisma.oTP.deleteMany({
      where: {
        email: normalizedEmail,
        type: "VERIFY_EMAIL",
      },
    });

    // Save the OTP in the database with temp user data in tempData
    await prisma.oTP.create({
      data: {
        email: normalizedEmail,
        otp,
        type: "VERIFY_EMAIL",
        expiresAt,
        tempData: {
          name,
          password: hashedPassword,
          phone: phone.trim(),
          role: finalRole,
        },
      },
    });

    // 6. Send OTP Email
    const htmlContent = `
      <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 8px;">
        <h2 style="color: #4CAF50; text-align: center;">Kiddos Food</h2>
        <p>Hi ${escapeHtml(name)},</p>
        <p>Thank you for registering. Please use the following One-Time Password (OTP) to verify your account:</p>
        <div style="background-color: #f9f9f9; border: 1px dashed #ccc; padding: 15px; font-size: 24px; font-weight: bold; text-align: center; letter-spacing: 5px; margin: 20px 0; color: #333;">
          ${otp}
        </div>
        <p style="font-size: 0.9em; color: #666;">This OTP is valid for 10 minutes. Please do not share it with anyone.</p>
      </div>
    `;

    await sendEmail(normalizedEmail, "Verify Your Account - Kiddos Food", htmlContent);

    // 7. Return response
    return NextResponse.json(
      {
        message: "Registration successful. Please check your email for the OTP.",
        user: {
          name,
          email: normalizedEmail,
          role: finalRole,
          isVerified: false,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
