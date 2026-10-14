import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { razorpay } from "@/lib/razorpay";
import crypto from "crypto";
import { getDeliveryFieldConfig, validateShippingAddress, normalizeShippingAddress, type DeliveryFieldConfig } from "@/lib/delivery-fields";
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
  city?: string;
  state?: string;
  pincode?: string;
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
    console.error("[payment/verify]", (error as { code?: string }).code ?? "", (error as Error).message);
    return NextResponse.json(
      {
        message: "Could not record your order. If money was deducted, please contact support.",
        // internal error text only outside production
        ...(process.env.NODE_ENV !== "production" && { detail: (error as Error).message }),
      },
      { status: 500 }
    );
  }
}

const isMoney = (v: unknown) => v !== "" && v != null && Number.isFinite(Number(v)) && Number(v) >= 0;

/** Returns a short reason when the order data is unusable, otherwise null. */
function validateOrderPayload(
  s: { subtotal: string; discount: string; deliveryFee: string; total: string; lineItems: LineItem[] } | undefined,
  addr: ShippingAddress | undefined,
  paidAmountPaise: number,
  fieldConfig: DeliveryFieldConfig
): string | null {
  if (!s || !Array.isArray(s.lineItems) || s.lineItems.length === 0) return "no items";
  if (![s.subtotal, s.discount, s.deliveryFee, s.total].every(isMoney)) return "invalid amounts";
  for (const i of s.lineItems) {
    if (!i || typeof i.productId !== "string" || !i.productId) return "invalid item";
    if (!Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > 1000) return "invalid quantity";
    if (!isMoney(i.unitPrice) || !isMoney(i.lineTotal)) return "invalid item price";
  }
  const total = Number(s.total);
  if (Math.round(total * 100) !== paidAmountPaise) return "total does not match the amount paid";
  if (Math.abs(Number(s.subtotal) - Number(s.discount) + Number(s.deliveryFee) - total) > 0.011) return "amounts do not add up";
  const addressError = validateShippingAddress(addr, fieldConfig);
  if (addressError) return addressError;
  return null;
}

async function verifyPayment(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ message: "Authentication required" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
  }
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
  let paidAmountPaise: number;
  try {
    const rpOrder = await razorpay.orders.fetch(razorpayOrderId);
    if (rpOrder.notes?.userId !== user.id) {
      return NextResponse.json({ message: "This payment does not belong to your account" }, { status: 403 });
    }
    paidAmountPaise = Number(rpOrder.amount);
  } catch (err) {
    console.error(`[payment/verify] could not fetch Razorpay order ${razorpayOrderId}:`, (err as Error).message);
    return NextResponse.json({ message: "Unable to verify payment order" }, { status: 400 });
  }

  // Validate the order payload before writing anything. The signature only proves the payment,
  // not that the cart data sent with it is sane, so pin the order to what Razorpay actually charged.
  const invalid = validateOrderPayload(orderSummary, shippingAddress, paidAmountPaise, await getDeliveryFieldConfig());
  if (invalid) {
    console.error(`[payment/verify] rejected payload for payment ${razorpayPaymentId}: ${invalid}`);
    return NextResponse.json(
      { message: `Order data is invalid (${invalid}). If money was deducted, contact support with payment ID ${razorpayPaymentId}.` },
      { status: 400 }
    );
  }

  const address = normalizeShippingAddress(shippingAddress);

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
          // keep only the known address fields (optional ones may be empty)
          shippingAddress: address,
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
      // order + items + coupon + stock commit together or not at all; default 5s is too tight for big carts
    }, { maxWait: 10000, timeout: 30000 });
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
      customerName: dbUser.name ?? address.name,
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
      shippingAddress: address,
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
        name: dbUser?.name ?? (address.name || "Customer"),
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
      shippingAddress: address,
    },
    razorpayPaymentId // one notification per payment, even if the client retries verification
  );

  return orderResponse(order, razorpayPaymentId);
}
