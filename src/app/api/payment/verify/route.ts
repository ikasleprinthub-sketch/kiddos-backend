import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { sendOrderConfirmationEmail } from "@/services/email.service";

function generateOrderNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `KD${timestamp}${random}`;
}

interface LineItem {
  productId: string;
  variantId?: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface ShippingAddress {
  name: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  pincode: string;
}

export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ message: "Authentication required" }, { status: 401 });
  }

  const body = await request.json();
  const {
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
    orderSummary,
    shippingAddress,
    couponCode,
    notes,
  } = body as {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
    orderSummary: {
      subtotal: string;
      discount: string;
      deliveryFee: string;
      total: string;
      lineItems: LineItem[];
    };
    shippingAddress: ShippingAddress;
    couponCode?: string;
    notes?: string;
  };

  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    return NextResponse.json({ message: "Missing payment verification data" }, { status: 400 });
  }

  // Verify signature
  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");

  if (expectedSignature !== razorpaySignature) {
    return NextResponse.json({ message: "Payment verification failed: invalid signature" }, { status: 400 });
  }

  // Resolve coupon if used
  let couponId: string | null = null;
  if (couponCode) {
    const coupon = await prisma.coupon.findUnique({ where: { code: couponCode.toUpperCase() } });
    if (coupon) {
      couponId = coupon.id;
      await prisma.coupon.update({
        where: { id: coupon.id },
        data: { usedCount: { increment: 1 } },
      });
    }
  }

  // Deduct stock
  await Promise.all(
    orderSummary.lineItems.map((item) => {
      if (item.variantId) {
        return prisma.productVariant.update({
          where: { id: item.variantId },
          data: { stock: { decrement: item.quantity } },
        });
      }
      return prisma.product.update({
        where: { id: item.productId },
        data: { stock: { decrement: item.quantity } },
      });
    })
  );

  // Create order in DB
  const orderNumber = generateOrderNumber();
  const order = await prisma.order.create({
    data: {
      orderNumber,
      userId: user.id,
      status: "CONFIRMED",
      paymentStatus: "PAID",
      paymentMethod: "RAZORPAY",
      subtotal: Number(orderSummary.subtotal),
      discount: Number(orderSummary.discount),
      deliveryFee: Number(orderSummary.deliveryFee),
      total: Number(orderSummary.total),
      couponId,
      notes: notes || null,
      shippingAddress: shippingAddress as object,
      items: {
        create: orderSummary.lineItems.map((item) => ({
          productId: item.productId,
          variantId: item.variantId || null,
          quantity: item.quantity,
          price: item.unitPrice,
          total: item.lineTotal,
        })),
      },
    },
    include: {
      items: { include: { product: { select: { id: true, name: true } } } },
    },
  });

  // Send confirmation email (non-blocking — don't fail the response if email errors)
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { email: true, name: true },
  });
  if (dbUser?.email) {
    sendOrderConfirmationEmail(dbUser.email, {
      customerName: dbUser.name ?? shippingAddress.name,
      orderNumber: order.orderNumber,
      razorpayPaymentId,
      items: order.items.map((item) => ({
        name: item.product.name ?? "Unnamed Product",
        quantity: item.quantity,
        price: Number(item.price),
        total: Number(item.total),
      })),
      subtotal: Number(orderSummary.subtotal),
      discount: Number(orderSummary.discount),
      deliveryFee: Number(orderSummary.deliveryFee),
      total: Number(orderSummary.total),
      shippingAddress,
    }).catch((err) => console.error("Order confirmation email failed:", err));
  }

  return NextResponse.json({
    success: true,
    order: {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      total: order.total,
      createdAt: order.createdAt,
    },
    razorpayPaymentId,
  });
}
