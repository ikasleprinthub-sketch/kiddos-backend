import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/services/email.service";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json(
        { message: "Email is required" },
        { status: 400 }
      );
    }

    // 1. Find user by email
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    // Security practice: Don't reveal if a user exists or not to prevent user enumeration attacks.
    // Instead, return a generic success message, but only send the email if the user exists.
    if (!user) {
      return NextResponse.json(
        { message: "If an account exists with that email, a password reset link has been sent." },
        { status: 200 }
      );
    }

    // 2. Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");

    // 3. Store reset token in the user record
    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken },
    });

    // 4. Send Reset Email
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const resetLink = `${frontendUrl}/reset-password/${resetToken}`;

    const htmlContent = `
      <div style="font-family: sans-serif; padding: 20px; color: #333;">
        <h2>Reset Your Password</h2>
        <p>Hi ${user.name},</p>
        <p>You requested a password reset. Please click the button below to set a new password:</p>
        <p style="margin: 24px 0;">
          <a href="${resetLink}" style="background-color: #f44336; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">
            Reset Password
          </a>
        </p>
        <p>If the button doesn't work, copy and paste this URL into your browser:</p>
        <p><a href="${resetLink}">${resetLink}</a></p>
        <p style="font-size: 0.9em; color: #666; margin-top: 20px;">If you didn't request a password reset, please ignore this email.</p>
      </div>
    `;

    await sendEmail(user.email, "Reset Your Password - Kiddos Food", htmlContent);

    return NextResponse.json(
      { message: "If an account exists with that email, a password reset link has been sent." },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Forgot password error:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
