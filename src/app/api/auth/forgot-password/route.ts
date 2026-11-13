import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/services/email.service";
import { escapeHtml, generateOtp, limitEmailSends } from "@/lib/otp";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (typeof email !== "string" || !email.trim()) {
      return NextResponse.json(
        { message: "Email is required" },
        { status: 400 }
      );
    }

    // Same answer whether or not the account exists, so this can't be used to discover registered emails
    const genericResponse = NextResponse.json(
      { message: "If an account exists for this email, a password reset code has been sent." },
      { status: 200 }
    );

    const limited = await limitEmailSends(request, "reset", email.trim().toLowerCase());
    if (limited) return limited;

    // 1. Find user by email
    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    if (!user) {
      return genericResponse;
    }

    // 2. Generate 6-digit numeric Reset OTP
    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

    // Delete any old reset OTP records for this email
    await prisma.oTP.deleteMany({
      where: {
        email: user.email,
        type: "RESET_PASSWORD",
      },
    });

    // 3. Store Reset OTP in database
    await prisma.oTP.create({
      data: {
        email: user.email,
        otp,
        type: "RESET_PASSWORD",
        expiresAt,
      },
    });

    // 4. Send Reset Email
    const htmlContent = `
      <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 8px;">
        <h2 style="color: #f44336; text-align: center;">Reset Your Password</h2>
        <p>Hi ${escapeHtml(user.name)},</p>
        <p>You requested a password reset. Please use the following One-Time Password (OTP) to complete the process:</p>
        <div style="background-color: #f9f9f9; border: 1px dashed #ccc; padding: 15px; font-size: 24px; font-weight: bold; text-align: center; letter-spacing: 5px; margin: 20px 0; color: #333;">
          ${otp}
        </div>
        <p style="font-size: 0.9em; color: #666;">This OTP is valid for 10 minutes. If you did not request this, please ignore this email.</p>
      </div>
    `;

    await sendEmail(user.email, "Reset Password OTP - Kiddos Food", htmlContent);

    return genericResponse;
  } catch (error: any) {
    console.error("Forgot password error:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
