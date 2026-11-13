import { prisma } from "@/lib/prisma";
import { razorpay } from "@/lib/razorpay";
import { escapeHtml } from "@/lib/otp";
import { sendAdminNewOrderEmail, sendEmail, sendOrderConfirmationEmail } from "@/services/email.service";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
type OrderRow = Awaited<ReturnType<typeof prisma.order.findUniqueOrThrow>>;

/** The cart exactly as /api/payment/create-order priced it (stored in pending_checkouts.summary). */
export interface PricedSummary {
  subtotal: string;
  discount: string;
  deliveryFee: string;
  total: string;
  couponCode: string | null;
  lineItems: {
    productId: string;
    variantId?: string | null;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    productName: string;
  }[];
}

class OutOfStockError extends Error {
  constructor(public productName: string) {
    super(`"${productName}" is out of stock`);
  }
}

/** Readable, per-year sequential order IDs: KF-YYYY-NNNN (e.g. KF-2026-0042). */
async function generateOrderNumber(tx: Tx): Promise<string> {
  const prefix = `KF-${new Date().getFullYear()}-`;
  const last = await tx.order.findFirst({
    where: { orderNumber: { startsWith: prefix } },
    orderBy: { createdAt: "desc" },
    select: { orderNumber: true },
  });
  const next = (last ? parseInt(last.orderNumber.slice(prefix.length), 10) || 0 : 0) + 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

const ORDER_CREATE_ATTEMPTS = 5;

/**
 * Run `create` in a transaction with a fresh order number. A unique-constraint clash is either a parallel
 * request that already saved this payment (its order is returned) or another checkout that took the same
 * order number (retried with the next number).
 */
async function createWithOrderNumber(
  razorpayPaymentId: string,
  create: (tx: Tx, orderNumber: string) => Promise<OrderRow>
): Promise<{ order: OrderRow; created: boolean }> {
  for (let attempt = 1; ; attempt++) {
    try {
      const order = await prisma.$transaction(
        async (tx) => create(tx, await generateOrderNumber(tx)),
        // order + items + coupon + stock commit together or not at all; default 5s is too tight for big carts
        { maxWait: 10000, timeout: 30000 }
      );
      return { order, created: true };
    } catch (err) {
      if ((err as { code?: string }).code === "P2002") {
        const winner = await prisma.order.findUnique({ where: { razorpayPaymentId } });
        if (winner) return { order: winner, created: false };
        if (attempt < ORDER_CREATE_ATTEMPTS) continue;
      }
      throw err;
    }
  }
}

/**
 * Full refund of a Razorpay payment. Reuses a refund for the same amount if one already exists
 * (e.g. an earlier request reached Razorpay but lost its response), so retries never refund twice.
 */
export async function refundPayment(paymentId: string, amountPaise: number) {
  const prior = await razorpay.payments.fetchMultipleRefund(paymentId, { count: 100 });
  let refund = prior.items.find((item) => item.amount === amountPaise && item.status !== "failed");
  if (!refund) {
    refund = await razorpay.payments.refund(paymentId, { amount: amountPaise });
  }
  if (refund.status === "failed") throw new Error("Razorpay rejected the refund request");
  return refund;
}

export type FinalizeResult =
  | { kind: "order"; order: OrderRow; created: boolean }
  | { kind: "refunded"; order: OrderRow; created: boolean; reason: string }
  | { kind: "not_found" };

/**
 * Turn a confirmed Razorpay payment into an order. Called by /api/payment/verify (the browser) and by
 * /api/payment/webhook (Razorpay), whichever comes first; the other gets the same order back.
 *
 * Everything comes from the server-side pending checkout, never from the request. Stock is only taken
 * when enough is left; if an item sold out after checkout started, the payment is refunded in full and
 * the order is recorded as REFUNDED so it stays visible to the admin and the customer.
 */
export async function finalizePaidCheckout(razorpayOrderId: string, razorpayPaymentId: string): Promise<FinalizeResult> {
  const existing = await prisma.order.findUnique({ where: { razorpayPaymentId } });
  if (existing) {
    return existing.paymentStatus === "REFUNDED" && existing.refundStatus !== null && existing.notes?.startsWith(AUTO_REFUND_PREFIX)
      ? { kind: "refunded", order: existing, created: false, reason: existing.notes }
      : { kind: "order", order: existing, created: false };
  }

  const pending = await prisma.pendingCheckout.findUnique({ where: { razorpayOrderId } });
  if (!pending) return { kind: "not_found" };

  const summary = pending.summary as unknown as PricedSummary;
  const items = summary.lineItems.map((li) => ({
    productId: li.productId,
    variantId: li.variantId || null,
    quantity: li.quantity,
    price: li.unitPrice,
    total: Math.round(li.unitPrice * li.quantity * 100) / 100,
  }));
  const base = {
    userId: pending.userId,
    paymentMethod: "RAZORPAY",
    razorpayPaymentId,
    subtotal: Number(summary.subtotal),
    discount: Number(summary.discount),
    deliveryFee: Number(summary.deliveryFee),
    total: Number(summary.total),
    shippingAddress: pending.shippingAddress as object,
  };

  let result: FinalizeResult;
  try {
    const { order, created } = await createWithOrderNumber(razorpayPaymentId, async (tx, orderNumber) => {
      // Take stock only if enough is left (conditional update: no overselling between parallel checkouts)
      for (const [i, item] of items.entries()) {
        const res = item.variantId
          ? await tx.productVariant.updateMany({
              where: { id: item.variantId, productId: item.productId, stock: { gte: item.quantity } },
              data: { stock: { decrement: item.quantity } },
            })
          : await tx.product.updateMany({
              where: { id: item.productId, stock: { gte: item.quantity } },
              data: { stock: { decrement: item.quantity } },
            });
        if (res.count !== 1) throw new OutOfStockError(summary.lineItems[i].productName);
      }

      return tx.order.create({
        data: {
          ...base,
          orderNumber,
          status: "CONFIRMED",
          paymentStatus: "PAID",
          couponId: await claimCoupon(tx, summary.couponCode),
          notes: pending.notes,
          items: { create: items },
        },
      });
    });
    result = { kind: "order", order, created };
  } catch (err) {
    if (!(err instanceof OutOfStockError)) throw err;
    result = await refundOutOfStock(razorpayPaymentId, pending.amountPaise, err.productName, base, items, pending.notes);
  }

  // The pending copy is no longer needed once the payment has an order
  await prisma.pendingCheckout.delete({ where: { razorpayOrderId } }).catch(() => {});

  if (result.kind !== "not_found" && result.created) {
    if (result.kind === "order") void sendOrderEmails(result.order.id);
    else void sendAutoRefundEmail(result.order.id, result.reason);
  }
  return result;
}

const AUTO_REFUND_PREFIX = "Automatically refunded:";

async function refundOutOfStock(
  razorpayPaymentId: string,
  amountPaise: number,
  productName: string,
  base: { userId: string; paymentMethod: string; razorpayPaymentId: string; subtotal: number; discount: number; deliveryFee: number; total: number; shippingAddress: object },
  items: { productId: string; variantId: string | null; quantity: number; price: number; total: number }[],
  customerNotes: string | null
): Promise<FinalizeResult> {
  const reason = `${AUTO_REFUND_PREFIX} "${productName}" sold out before your payment completed. The full amount is being returned to your original payment method.`;
  let refund;
  try {
    refund = await refundPayment(razorpayPaymentId, amountPaise);
  } catch (err) {
    // A parallel verify/webhook may already have refunded and recorded this payment
    const winner = await prisma.order.findUnique({ where: { razorpayPaymentId } });
    if (winner) return { kind: "refunded", order: winner, created: false, reason };
    throw err;
  }

  const { order, created } = await createWithOrderNumber(razorpayPaymentId, (tx, orderNumber) =>
    tx.order.create({
      data: {
        ...base,
        orderNumber,
        status: "REFUNDED",
        paymentStatus: "REFUNDED",
        razorpayRefundId: refund.id,
        refundStatus: String(refund.status).toUpperCase(),
        notes: customerNotes ? `${reason}\nCustomer note: ${customerNotes}` : reason,
        items: { create: items },
      },
    })
  );
  console.warn(`[orders] payment ${razorpayPaymentId} auto-refunded: ${productName} out of stock (order ${order.orderNumber})`);
  return { kind: "refunded", order, created, reason };
}

/** Link the coupon and count the use. The limit was checked when the price was quoted; the customer has
 *  already paid the discounted price, so a use that races past maxUses is honoured and logged. */
async function claimCoupon(tx: Tx, code: string | null): Promise<string | null> {
  if (!code) return null;
  const coupon = await tx.coupon.findUnique({ where: { code } });
  if (!coupon) return null;
  const updated = await tx.coupon.update({ where: { id: coupon.id }, data: { usedCount: { increment: 1 } } });
  if (updated.maxUses && updated.usedCount > updated.maxUses) {
    console.warn(`[orders] coupon ${code} used ${updated.usedCount} times (limit ${updated.maxUses}) by parallel checkouts`);
  }
  return coupon.id;
}

async function sendOrderEmails(orderId: string) {
  try {
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: {
        user: { select: { email: true, name: true, phone: true } },
        items: { include: { product: { select: { name: true } } } },
      },
    });
    const address = order.shippingAddress as unknown as Parameters<typeof sendOrderConfirmationEmail>[1]["shippingAddress"];
    const items = order.items.map((item) => ({
      name: item.product.name ?? "Unnamed Product",
      quantity: item.quantity,
      price: Number(item.price),
      total: Number(item.total),
    }));
    const money = {
      subtotal: Number(order.subtotal),
      discount: Number(order.discount),
      deliveryFee: Number(order.deliveryFee),
      total: Number(order.total),
    };

    if (order.user.email) {
      await sendOrderConfirmationEmail(order.user.email, {
        customerName: order.user.name ?? address.name,
        orderNumber: order.orderNumber,
        razorpayPaymentId: order.razorpayPaymentId ?? "",
        items,
        ...money,
        shippingAddress: address,
      }).catch((err) => console.error("Order confirmation email failed:", err));
    }

    await sendAdminNewOrderEmail(
      {
        orderId: order.id,
        orderNumber: order.orderNumber,
        createdAt: order.createdAt,
        status: order.status,
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        razorpayPaymentId: order.razorpayPaymentId ?? undefined,
        customer: { name: order.user.name ?? (address.name || "Customer"), email: order.user.email ?? "-", phone: order.user.phone },
        items,
        ...money,
        notes: order.notes,
        shippingAddress: address,
      },
      order.razorpayPaymentId ?? order.id // one notification per payment
    );
  } catch (err) {
    console.error("[orders] order emails failed:", (err as Error).message);
  }
}

async function sendAutoRefundEmail(orderId: string, reason: string) {
  try {
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { user: { select: { email: true, name: true } } } });
    if (!order.user.email) return;
    await sendEmail(
      order.user.email,
      `Payment refunded – ${order.orderNumber} | Kiddos Foods`,
      `<div style="font-family:sans-serif;padding:20px;color:#333;max-width:600px;margin:0 auto;">
        <h2 style="color:#4CAF50;">Kiddos Foods</h2>
        <p>Hi ${escapeHtml(order.user.name)},</p>
        <p>${escapeHtml(reason.replace(AUTO_REFUND_PREFIX, "").trim())}</p>
        <p>Order reference: <b>${escapeHtml(order.orderNumber)}</b> · Amount: ₹${Number(order.total).toFixed(2)}</p>
        <p style="color:#666;font-size:0.9em;">Refunds usually reach your account within 5–7 working days. We're sorry for the trouble.</p>
      </div>`
    );
  } catch (err) {
    console.error("[orders] refund email failed:", (err as Error).message);
  }
}

// ---------------------------------------------------------------------------
// Cancelling
// ---------------------------------------------------------------------------

export type CancelResult = { ok: true; refundId?: string; refundStatus?: string } | { ok: false; status: number; message: string };

/**
 * Cancel an order: refund it in full when it was paid online, put the stock back and release the coupon use.
 * `userId` restricts it to that customer's own orders; `allowed` lists the statuses it may be cancelled from.
 */
export async function cancelOrder(
  orderId: string,
  { userId, allowed }: { userId?: string; allowed: readonly string[] }
): Promise<CancelResult> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, ...(userId ? { userId } : {}) },
    include: { items: true },
  });
  if (!order) return { ok: false, status: 404, message: "Order not found" };
  if (!allowed.includes(order.status)) {
    return { ok: false, status: 409, message: "This order can no longer be cancelled" };
  }

  const paidOnline = order.paymentMethod === "RAZORPAY" && order.paymentStatus === "PAID" && !!order.razorpayPaymentId;

  if (!paidOnline) {
    // Nothing to refund: just cancel and return the stock (only one request can win the status change)
    const done = await prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({ where: { id: order.id, status: order.status }, data: { status: "CANCELLED" } });
      if (claimed.count !== 1) return false;
      await restoreStockAndCoupon(tx, order);
      return true;
    });
    return done ? { ok: true } : { ok: false, status: 409, message: "The order was changed by someone else. Please refresh." };
  }

  // Claim the order before contacting Razorpay. Only one concurrent request can win.
  const claimed = await prisma.order.updateMany({
    where: { id: order.id, status: order.status, paymentStatus: "PAID" },
    data: { status: "REFUNDED", refundStatus: "PROCESSING" },
  });
  if (claimed.count !== 1) {
    return { ok: false, status: 409, message: "Cancellation is already being processed" };
  }

  try {
    const refund = await refundPayment(order.razorpayPaymentId!, Math.round(Number(order.total) * 100));
    await prisma.$transaction(async (tx) => {
      await restoreStockAndCoupon(tx, order);
      await tx.order.update({
        where: { id: order.id },
        data: { status: "REFUNDED", paymentStatus: "REFUNDED", razorpayRefundId: refund.id, refundStatus: String(refund.status).toUpperCase() },
      });
    });
    return { ok: true, refundId: refund.id, refundStatus: String(refund.status) };
  } catch (error) {
    await prisma.order.updateMany({
      where: { id: order.id, status: "REFUNDED", paymentStatus: "PAID", refundStatus: "PROCESSING" },
      data: { status: order.status, refundStatus: "FAILED" },
    });
    console.error("Order cancellation refund failed:", error);
    const e = error as { error?: { description?: string }; message?: string };
    return { ok: false, status: 502, message: e?.error?.description || e?.message || "Refund could not be initiated" };
  }
}

async function restoreStockAndCoupon(
  tx: Tx,
  order: { couponId: string | null; items: { productId: string; variantId: string | null; quantity: number }[] }
) {
  for (const item of order.items) {
    if (item.variantId) {
      await tx.productVariant.updateMany({ where: { id: item.variantId }, data: { stock: { increment: item.quantity } } });
    } else {
      await tx.product.updateMany({ where: { id: item.productId }, data: { stock: { increment: item.quantity } } });
    }
  }
  if (order.couponId) {
    await tx.coupon.updateMany({ where: { id: order.couponId, usedCount: { gt: 0 } }, data: { usedCount: { decrement: 1 } } });
  }
}
