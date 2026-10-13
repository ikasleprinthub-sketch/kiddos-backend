import { NextRequest, NextResponse } from "next/server";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "@/lib/prisma";
import { generateToken } from "@/lib/auth";

const googleClient = new OAuth2Client();

// The login page obtains a Google ID token (Google Identity Services) and posts it here.
export async function POST(request: NextRequest) {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      console.error("GOOGLE_CLIENT_ID is not configured");
      return NextResponse.json(
        { message: "Google login is not configured" },
        { status: 500 }
      );
    }

    const { credential } = await request.json();
    if (!credential || typeof credential !== "string") {
      return NextResponse.json(
        { message: "Google credential is required" },
        { status: 400 }
      );
    }

    // 1. Verify signature, audience and expiry with Google
    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: clientId,
      });
      payload = ticket.getPayload();
    } catch {
      return NextResponse.json(
        { message: "Invalid Google credential" },
        { status: 401 }
      );
    }

    if (!payload?.sub || !payload.email || !payload.email_verified) {
      return NextResponse.json(
        { message: "Google account email is not verified" },
        { status: 401 }
      );
    }

    const email = payload.email.toLowerCase();

    // 2. Find by Google ID, otherwise by email (links an existing password account)
    let user = await prisma.user.findUnique({ where: { googleId: payload.sub } });
    if (!user) {
      user = await prisma.user.findUnique({ where: { email } });
    }

    if (user) {
      if (!user.isActive) {
        return NextResponse.json(
          { message: "Your account is suspended. Please contact support." },
          { status: 403 }
        );
      }

      // Google has verified this email, so link the account and mark it verified
      if (user.googleId !== payload.sub || !user.isVerified) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { googleId: payload.sub, isVerified: true },
        });
      }
    } else {
      // 3. First time login: create the account (always USER, never ADMIN)
      user = await prisma.user.create({
        data: {
          name: payload.name || email.split("@")[0],
          email,
          googleId: payload.sub,
          isVerified: true,
          role: "USER",
        },
      });
    }

    // 4. Same response and cookie as /api/auth/login
    const token = generateToken({ id: user.id, role: user.role });

    const response = NextResponse.json(
      { success: true, token, role: user.role },
      { status: 200 }
    );

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
    console.error("Google login error:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
