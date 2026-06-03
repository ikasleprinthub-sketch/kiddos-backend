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
        type: "VERIFY_EMAIL",
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
        { message: "OTP has expired. Please register again or request a new OTP." },
        { status: 400 }
      );
    }

    // 4. Find and verify user
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      return NextResponse.json(
        { message: "User not found" },
        { status: 404 }
      );
    }

    // Update user verification status
    await prisma.user.update({
      where: { id: user.id },
      data: { isVerified: true },
    });

    // Delete verified OTP record
    await prisma.oTP.delete({
      where: { id: otpRecord.id },
    });

    return NextResponse.json(
      { message: "Account activated successfully! You can now log in." },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("OTP verification error:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
