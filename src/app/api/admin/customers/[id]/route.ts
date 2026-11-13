import { NextRequest, NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isValidMobile } from "@/lib/validation";
import { isValidEmail } from "@/services/email.service";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await authorizeAdmin(request);
  if (!admin) return NextResponse.json({ message: "Access denied: Admins only" }, { status: 403 });

  const { id } = await params;
  const customer = await prisma.user.findUnique({
    where: { id, role: "USER" },
    select: {
      id: true, name: true, email: true, phone: true,
      isVerified: true, isActive: true, createdAt: true, updatedAt: true,
      orders: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true, orderNumber: true, status: true, paymentStatus: true,
          total: true, createdAt: true,
        },
      },
      _count: { select: { orders: true } },
    },
  });

  if (!customer) return NextResponse.json({ message: "Customer not found" }, { status: 404 });

  const totalSpent = await prisma.order.aggregate({
    _sum: { total: true },
    where: { userId: id, paymentStatus: "PAID" },
  });

  return NextResponse.json({ customer, totalSpent: Number(totalSpent._sum.total || 0).toFixed(2) });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await authorizeAdmin(request);
  if (!admin) return NextResponse.json({ message: "Access denied: Admins only" }, { status: 403 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ message: "Invalid request" }, { status: 400 });
  const { isActive, name, email, phone, isVerified } = body;

  if (isActive !== undefined && typeof isActive !== "boolean") return NextResponse.json({ message: "Invalid status" }, { status: 400 });
  if (isVerified !== undefined && typeof isVerified !== "boolean") return NextResponse.json({ message: "Invalid status" }, { status: 400 });
  if (name !== undefined && (typeof name !== "string" || !name.trim() || name.length > 100)) {
    return NextResponse.json({ message: "Please enter a valid name" }, { status: 400 });
  }
  if (email !== undefined && (typeof email !== "string" || !isValidEmail(email.trim()))) {
    return NextResponse.json({ message: "Please enter a valid email address" }, { status: 400 });
  }
  if (phone !== undefined && phone !== null && phone !== "" && !isValidMobile(phone)) {
    return NextResponse.json({ message: "Please enter a valid 10-digit mobile number" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { id, role: "USER" } });
  if (!existing) return NextResponse.json({ message: "Customer not found" }, { status: 404 });

  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : undefined;
  if (normalizedEmail && normalizedEmail !== existing.email) {
    const taken = await prisma.user.findUnique({ where: { email: normalizedEmail }, select: { id: true } });
    if (taken) return NextResponse.json({ message: "Another account already uses this email" }, { status: 409 });
  }

  // Suspending (or changing the login email) signs the customer out of every device
  const endSessions = (isActive === false && existing.isActive) || (normalizedEmail && normalizedEmail !== existing.email);

  const customer = await prisma.user.update({
    where: { id },
    data: {
      isActive: isActive !== undefined ? isActive : undefined,
      name: typeof name === "string" ? name.trim() : undefined,
      email: normalizedEmail,
      phone: phone !== undefined ? (typeof phone === "string" && phone.trim() ? phone.trim() : null) : undefined,
      isVerified: isVerified !== undefined ? isVerified : undefined,
      tokenVersion: endSessions ? { increment: 1 } : undefined,
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      isActive: true,
      isVerified: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ customer });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await authorizeAdmin(request);
  if (!admin) return NextResponse.json({ message: "Access denied: Admins only" }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.user.findUnique({ where: { id, role: "USER" } });
  if (!existing) return NextResponse.json({ message: "Customer not found" }, { status: 404 });

  if (existing.isActive) {
    return NextResponse.json({ message: "Only suspended customers can be deleted. Please suspend the account first." }, { status: 400 });
  }

  const orderCount = await prisma.order.count({ where: { userId: id } });

  if (orderCount === 0) {
    // No purchase history: remove the account completely (wishlist rows cascade)
    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ message: "Customer deleted successfully" });
  }

  // Orders are financial records (payments, refunds, invoices) and must be kept. Remove the person's
  // details instead: the account can no longer log in and no longer shows their name, email or phone.
  // (Shipping addresses on past orders stay, as they are part of the order record.)
  await prisma.$transaction([
    prisma.wishlistItem.deleteMany({ where: { userId: id } }),
    prisma.user.update({
      where: { id },
      data: {
        name: "Deleted customer",
        email: `deleted-${id}@deleted.invalid`,
        phone: null,
        password: null,
        googleId: null,
        isActive: false,
        tokenVersion: { increment: 1 },
      },
    }),
  ]);

  return NextResponse.json({
    message: `Customer deleted. Their ${orderCount} order(s) were kept for your records with personal details removed.`,
  });
}
