import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { limitOtpAttempts } from "@/lib/otp";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, otp } = body;

    if (typeof email !== "string" || typeof otp !== "string" || !email || !otp) {
      return NextResponse.json(
        { message: "Email and OTP are required" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase();

    // Shares its counter with /reset-password, so the two endpoints together allow only a few guesses
    const limited = await limitOtpAttempts("reset-password", normalizedEmail);
    if (limited) return limited;

    const otpRecord = await prisma.oTP.findFirst({
      where: { email: normalizedEmail, otp, type: "RESET_PASSWORD" },
    });

    if (!otpRecord) {
      return NextResponse.json(
        { message: "Invalid OTP code" },
        { status: 400 }
      );
    }

    if (new Date() > otpRecord.expiresAt) {
      await prisma.oTP.delete({ where: { id: otpRecord.id } });
      return NextResponse.json(
        { message: "OTP has expired. Please request a new one." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "OTP verified successfully. You may now reset your password.",
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Verify reset OTP error:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
