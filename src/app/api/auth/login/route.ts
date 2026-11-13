import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { generateToken } from "@/lib/auth";
import { limitLoginAttempts } from "@/lib/otp";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    // 1. Basic validation
    if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
      return NextResponse.json(
        { message: "Email and password are required" },
        { status: 400 }
      );
    }

    const limited = await limitLoginAttempts(request, email.toLowerCase());
    if (limited) return limited;

    // 2. Find user in database
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      // A sign-up waiting for its email OTP: say so only to someone who knows that sign-up's password,
      // so this endpoint can't be used to find out which emails are registered.
      const pendingOtp = await prisma.oTP.findFirst({
        where: {
          email: email.toLowerCase(),
          type: "VERIFY_EMAIL",
        },
      });
      const pendingHash = (pendingOtp?.tempData as { password?: unknown } | null)?.password;
      const pendingMatch = typeof pendingHash === "string" && (await bcrypt.compare(password, pendingHash));

      if (pendingMatch) {
        return NextResponse.json(
          { message: "Please verify your email address before logging in." },
          { status: 403 }
        );
      }

      // Same answer as a wrong password
      return NextResponse.json(
        { message: "Invalid email or password" },
        { status: 401 }
      );
    }

    // 3. Check password match (Google-only accounts have no password)
    if (!user.password) {
      return NextResponse.json(
        { message: "This account uses Google sign-in. Please continue with Google." },
        { status: 401 }
      );
    }
    const isPasswordMatch = await bcrypt.compare(password, user.password);
    if (!isPasswordMatch) {
      return NextResponse.json(
        { message: "Invalid email or password" },
        { status: 401 }
      );
    }

    // 4. Check if email is verified
    if (!user.isVerified) {
      return NextResponse.json(
        { message: "Please verify your email address before logging in." },
        { status: 403 }
      );
    }

    // 4.5. Check if user is active (not suspended)
    if (!user.isActive) {
      return NextResponse.json(
        { message: "Your account is suspended. Please contact support." },
        { status: 403 }
      );
    }

    // 5. Generate JWT token
    const token = generateToken({
      id: user.id,
      role: user.role,
      tv: user.tokenVersion,
    });

    // 6. Build response using requested JSON format
    const response = NextResponse.json(
      {
        success: true,
        token,
        role: user.role,
      },
      { status: 200 }
    );

    // 7. Set HTTP-only Cookie for security
    response.cookies.set({
      name: "token",
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return response;
  } catch (error: any) {
    console.error("Login error:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
