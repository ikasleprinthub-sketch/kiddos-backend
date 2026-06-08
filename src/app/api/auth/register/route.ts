import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/services/email.service";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, password, role } = body;

    // 1. Basic validation
    if (!name || !email || !password) {
      return NextResponse.json(
        { message: "Missing required fields: name, email, password" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { message: "Password must be at least 6 characters long" },
        { status: 400 }
      );
    }

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

    // 4. Determine Role (default to USER)
    const finalRole = role === "ADMIN" ? "ADMIN" : "USER";

    // 5. Generate 6-digit numeric OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
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
          role: finalRole,
        },
      },
    });

    // 6. Send OTP Email
    const htmlContent = `
      <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 8px;">
        <h2 style="color: #4CAF50; text-align: center;">Kiddos Food</h2>
        <p>Hi ${name},</p>
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
