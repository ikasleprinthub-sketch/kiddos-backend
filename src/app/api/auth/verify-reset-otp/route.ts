import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, otp } = body;

    // 1. Basic validation
    if (!email || !otp) {
      return NextResponse.json(
        { message: "Email and OTP are required" },
        { status: 400 }
      );
    }

    // 2. Find matching OTP
    const otpRecord = await prisma.oTP.findFirst({
      where: {
        email: email.toLowerCase(),
        otp,
        type: "RESET_PASSWORD",
      },
    });

    if (!otpRecord) {
      return NextResponse.json(
        { message: "Invalid OTP code" },
        { status: 400 }
      );
    }

    // 3. Check if expired
    if (new Date() > otpRecord.expiresAt) {
      return NextResponse.json(
        { message: "OTP has expired. Please request a new OTP." },
        { status: 400 }
      );
    }

    // OTP is valid. Return success.
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
