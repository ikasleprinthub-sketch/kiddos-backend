import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import bcrypt from "bcryptjs";

export async function GET(request: NextRequest) {
  try {
    const payload = getUserFromRequest(request);

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
        role: true,
        isVerified: true,
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

    return NextResponse.json(
      {
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
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
    const payload = getUserFromRequest(request);
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

    const updateData: Record<string, unknown> = {};

    if (name !== undefined) {
      if (!name.trim()) return NextResponse.json({ message: "Name cannot be empty" }, { status: 400 });
      updateData.name = name.trim();
    }

    if (phone !== undefined) {
      updateData.phone = phone.trim() || null;
    }

    if (newPassword !== undefined) {
      if (!currentPassword) {
        return NextResponse.json({ message: "Current password is required to set a new password" }, { status: 400 });
      }
      const valid = await bcrypt.compare(currentPassword, user.password);
      if (!valid) {
        return NextResponse.json({ message: "Current password is incorrect" }, { status: 400 });
      }
      if (newPassword.length < 8) {
        return NextResponse.json({ message: "New password must be at least 8 characters" }, { status: 400 });
      }
      updateData.password = await bcrypt.hash(newPassword, 10);
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ message: "No fields to update" }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: payload.id },
      data: updateData,
      select: { id: true, name: true, email: true, phone: true, role: true },
    });

    return NextResponse.json({ user: updated });
  } catch (error: any) {
    console.error("PUT /api/auth/me error:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
