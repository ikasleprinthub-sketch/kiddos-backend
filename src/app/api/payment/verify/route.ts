import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { razorpay } from "@/lib/razorpay";
import crypto from "crypto";
import { sendOrderConfirmationEmail, sendAdminNewOrderEmail } from "@/services/email.service";

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

function orderResponse(
  order: { id: string; orderNumber: string; status: string; paymentStatus: string; total: unknown; createdAt: Date },
  razorpayPaymentId: string
) {
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

export async function POST(request: NextRequest) {
  try {
    return await verifyPayment(request);
  } catch (error) {
    // Always answer with JSON so the checkout page can show a message instead of failing to parse an empty 500
    console.error("[payment/verify]", error);
    return NextResponse.json(
      { message: "Could not record your order. If money was deducted, please contact support.", detail: (error as Error).message },
      { status: 500 }
    );
  }
}

async function verifyPayment(request: NextRequest) {
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

  // Ownership: the Razorpay order must have been created for this authenticated user
  // (create-order stores userId in its notes), so one user cannot claim another user's payment.
  try {
    const rpOrder = await razorpay.orders.fetch(razorpayOrderId);
    if (rpOrder.notes?.userId !== user.id) {
      return NextResponse.json({ message: "This payment does not belong to your account" }, { status: 403 });
    }
  } catch (err) {
    console.error("[payment/verify] could not fetch Razorpay order", err);
    return NextResponse.json({ message: "Unable to verify payment order" }, { status: 400 });
  }

  // Idempotency: this payment may already have produced an order (client retry / double submit)
  const alreadyCreated = await prisma.order.findUnique({ where: { razorpayPaymentId } });
  if (alreadyCreated) {
    return orderResponse(alreadyCreated, razorpayPaymentId);
  }

  // Create the order, update coupon usage and deduct stock atomically.
  // The unique razorpayPaymentId makes a concurrent duplicate fail and roll everything back.
  const orderNumber = generateOrderNumber();
  let order;
  try {
    order = await prisma.$transaction(async (tx) => {
      let couponId: string | null = null;
      if (couponCode) {
        const coupon = await tx.coupon.findUnique({ where: { code: couponCode.toUpperCase() } });
        if (coupon) {
          couponId = coupon.id;
          await tx.coupon.update({
            where: { id: coupon.id },
            data: { usedCount: { increment: 1 } },
          });
        }
      }

      const created = await tx.order.create({
        data: {
          orderNumber,
          userId: user.id,
          status: "CONFIRMED",
          paymentStatus: "PAID",
          paymentMethod: "RAZORPAY",
          razorpayPaymentId,
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

      // Deduct stock
      for (const item of orderSummary.lineItems) {
        if (item.variantId) {
          await tx.productVariant.update({
            where: { id: item.variantId },
            data: { stock: { decrement: item.quantity } },
          });
        } else {
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { decrement: item.quantity } },
          });
        }
      }

      return created;
    });
  } catch (err) {
    // Lost a race with a parallel request for the same payment: return that order instead
    if ((err as { code?: string }).code === "P2002") {
      const winner = await prisma.order.findUnique({ where: { razorpayPaymentId } });
      if (winner) return orderResponse(winner, razorpayPaymentId);
    }
    throw err;
  }

  // Send confirmation email (non-blocking — don't fail the response if email errors)
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { email: true, name: true, phone: true },
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

  // Notify the admin (order is already saved; failures are logged and never affect the response)
  void sendAdminNewOrderEmail(
    {
      orderId: order.id,
      orderNumber: order.orderNumber,
      createdAt: order.createdAt,
      status: order.status,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      razorpayPaymentId,
      customer: {
        name: dbUser?.name ?? shippingAddress.name,
        email: dbUser?.email ?? "-",
        phone: dbUser?.phone,
      },
      items: order.items.map((item) => ({
        name: item.product.name ?? "Unnamed Product",
        quantity: item.quantity,
        price: Number(item.price),
        total: Number(item.total),
      })),
      subtotal: Number(order.subtotal),
      discount: Number(order.discount),
      deliveryFee: Number(order.deliveryFee),
      total: Number(order.total),
      notes: order.notes,
      shippingAddress,
    },
    razorpayPaymentId // one notification per payment, even if the client retries verification
  );

  return orderResponse(order, razorpayPaymentId);
}
