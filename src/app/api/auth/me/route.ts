import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateToken, getUserFromRequest } from "@/lib/auth";
import { isValidMobile } from "@/lib/validation";
import bcrypt from "bcryptjs";

export async function GET(request: NextRequest) {
  try {
    const payload = await getUserFromRequest(request);

    if (!payload) {
      return NextResponse.json(
        { message: "Unauthorized: Invalid or missing token" },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isVerified: true,
        isActive: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { message: "User not found" },
        { status: 404 }
      );
    }

    if (!user.isVerified) {
      return NextResponse.json(
        { message: "Please verify your email address before continuing" },
        { status: 403 }
      );
    }

    if (!user.isActive) {
      return NextResponse.json(
        { message: "Your account is suspended. Please contact support." },
        { status: 403 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("GET /api/auth/me error:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const payload = await getUserFromRequest(request);
    if (!payload) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, phone, currentPassword, newPassword } = body as {
      name?: string;
      phone?: string;
      currentPassword?: string;
      newPassword?: string;
    };

    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user) return NextResponse.json({ message: "User not found" }, { status: 404 });

    if (!user.isActive) {
      return NextResponse.json({ message: "Your account is suspended. Please contact support." }, { status: 403 });
    }

    const updateData: Record<string, unknown> = {};

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) return NextResponse.json({ message: "Name cannot be empty" }, { status: 400 });
      if (name.trim().length > 100) return NextResponse.json({ message: "Name is too long" }, { status: 400 });
      updateData.name = name.trim();
    }

    if (phone !== undefined) {
      if (typeof phone !== "string") return NextResponse.json({ message: "Invalid phone number" }, { status: 400 });
      if (phone.trim() && !isValidMobile(phone)) {
        return NextResponse.json({ message: "Please enter a valid 10-digit mobile number" }, { status: 400 });
      }
      updateData.phone = phone.trim() || null;
    }

    if (newPassword !== undefined) {
      if (typeof newPassword !== "string" || typeof currentPassword !== "string" || !currentPassword) {
        return NextResponse.json({ message: "Current password is required to set a new password" }, { status: 400 });
      }
      const valid = user.password
        ? await bcrypt.compare(currentPassword, user.password)
        : false;
      if (!valid) {
        return NextResponse.json({ message: "Current password is incorrect" }, { status: 400 });
      }
      if (newPassword.length < 8 || newPassword.length > 128) {
        return NextResponse.json({ message: "New password must be at least 8 characters" }, { status: 400 });
      }
      updateData.password = await bcrypt.hash(newPassword, 10);
      // Sign out every other device; this one gets a fresh token below
      updateData.tokenVersion = { increment: 1 };
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ message: "No fields to update" }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: payload.id },
      data: updateData,
      select: { id: true, name: true, email: true, phone: true, role: true, tokenVersion: true },
    });

    const { tokenVersion, ...publicUser } = updated;
    if (newPassword === undefined) {
      return NextResponse.json({ user: publicUser });
    }

    const token = generateToken({ id: updated.id, role: updated.role, tv: tokenVersion });
    const response = NextResponse.json({ user: publicUser, token });
    response.cookies.set({
      name: "token",
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });
    return response;
  } catch (error: any) {
    console.error("PUT /api/auth/me error:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
