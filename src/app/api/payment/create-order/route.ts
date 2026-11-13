import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { razorpay } from "@/lib/razorpay";
import { getDeliveryFieldConfig, normalizeShippingAddress, validateShippingAddress } from "@/lib/delivery-fields";
import { parseCartItems } from "@/lib/checkout";

interface ShippingAddress {
  name: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

export async function POST(request: NextRequest) {
  try {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ message: "Authentication required" }, { status: 401 });
  }

  const body = await request.json();
  const { items, shippingAddress, couponCode: rawCouponCode, notes } = body as {
    items: unknown;
    shippingAddress: ShippingAddress;
    couponCode?: unknown;
    notes?: string;
  };
  const couponCode = typeof rawCouponCode === "string" && rawCouponCode.trim() ? rawCouponCode.trim() : undefined;

  // Validates every line (whole-number quantity 1..1000, no negatives) and merges duplicates
  const parsedCart = parseCartItems(items);
  if ("error" in parsedCart) {
    return NextResponse.json({ message: parsedCart.error }, { status: 400 });
  }
  const uniqueItems = parsedCart.items;

  const addressError = validateShippingAddress(shippingAddress, await getDeliveryFieldConfig());
  if (addressError) {
    return NextResponse.json({ message: addressError }, { status: 400 });
  }

  // Load and validate products (the same product can appear on several lines with different variants)
  const productIds = [...new Set(uniqueItems.map((i) => i.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, isActive: true },
    select: { 
      id: true, 
      name: true, 
      price: true, 
      salePrice: true, 
      stock: true, 
      isActive: true,
      variants: {
        select: {
          id: true,
          price: true,
          salePrice: true,
          stock: true,
          isActive: true
        }
      }
    },
  });

  if (products.length !== productIds.length) {
    return NextResponse.json({ message: "One or more products are unavailable" }, { status: 400 });
  }

  // Verify stock
  for (const item of uniqueItems) {
    const product = products.find((p) => p.id === item.productId)!;
    if (item.variantId) {
      const variant = product.variants.find(v => v.id === item.variantId);
      if (!variant || !variant.isActive) {
        return NextResponse.json({ message: `Variant for "${product.name}" is unavailable` }, { status: 400 });
      }
      if (variant.stock < item.quantity) {
        return NextResponse.json(
          { message: `Insufficient stock for "${product.name}" (available: ${variant.stock})` },
          { status: 400 }
        );
      }
    } else {
      // A product without its own price (e.g. priced only through variants) must not be sold for ₹0
      if (product.price == null) {
        return NextResponse.json(
          { message: `Please choose an option for "${product.name ?? "this product"}"` },
          { status: 400 }
        );
      }
      if (product.stock < item.quantity) {
        return NextResponse.json(
          { message: `Insufficient stock for "${product.name ?? "Unnamed Product"}" (available: ${product.stock})` },
          { status: 400 }
        );
      }
    }
  }

  // Calculate subtotal — prefer salePrice when set
  const lineItems = uniqueItems.map((item) => {
    const product = products.find((p) => p.id === item.productId)!;
    let unitPrice = 0;
    
    if (item.variantId) {
      const variant = product.variants.find(v => v.id === item.variantId)!;
      unitPrice = variant.salePrice != null ? Number(variant.salePrice) : Number(variant.price);
    } else {
      unitPrice = product.salePrice != null ? Number(product.salePrice) : Number(product.price);
    }
    
    return { 
      ...item, 
      unitPrice, 
      lineTotal: unitPrice * item.quantity, 
      productName: product.name ?? "Unnamed Product" 
    };
  });

  const subtotal = lineItems.reduce((sum, li) => sum + li.lineTotal, 0);

  // Apply coupon if provided
  let discount = 0;
  let coupon = null;
  if (couponCode) {
    coupon = await prisma.coupon.findUnique({
      where: { code: couponCode.toUpperCase() },
    });

    if (!coupon || !coupon.isActive) {
      return NextResponse.json({ message: "Invalid or expired coupon code" }, { status: 400 });
    }
    if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
      return NextResponse.json({ message: "Coupon has expired" }, { status: 400 });
    }
    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
      return NextResponse.json({ message: "Coupon usage limit reached" }, { status: 400 });
    }
    if (coupon.minOrderAmount && subtotal < Number(coupon.minOrderAmount)) {
      return NextResponse.json(
        { message: `Minimum order amount for this coupon is ₹${coupon.minOrderAmount}` },
        { status: 400 }
      );
    }

    if (coupon.type === "PERCENTAGE") {
      discount = (subtotal * Number(coupon.value)) / 100;
    } else {
      discount = Math.min(Number(coupon.value), subtotal);
    }
  }

  // Delivery fee: Admin > Settings > Shipping (defaults: free above ₹500, else ₹50)
  const shippingSettings = await prisma.setting.findMany({
    where: { key: { in: ["free_shipping_threshold", "default_delivery_fee"] } },
  });
  const settingNum = (key: string, fallback: number) => {
    const raw = shippingSettings.find((x) => x.key === key)?.value;
    const n = raw === undefined || raw.trim() === "" ? NaN : Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  const freeShippingAbove = settingNum("free_shipping_threshold", 500);
  const deliveryFee = subtotal - discount >= freeShippingAbove ? 0 : settingNum("default_delivery_fee", 50);

  const total = Math.max(0, subtotal - discount + deliveryFee);

  const orderSummary = {
    subtotal: subtotal.toFixed(2),
    discount: discount.toFixed(2),
    deliveryFee: deliveryFee.toFixed(2),
    total: total.toFixed(2),
    couponCode: coupon?.code || null,
    lineItems,
  };

  const amountPaise = Math.round(total * 100);
  if (amountPaise < 100) {
    return NextResponse.json({ message: "Order total must be at least ₹1" }, { status: 400 });
  }

  // Create Razorpay order (amount in paise)
  const razorpayOrder = await razorpay.orders.create({
    amount: amountPaise,
    currency: "INR",
    receipt: `kiddos_${Date.now()}`,
    notes: {
      userId: user.id,
      couponCode: coupon?.code || "",
    },
  });

  // Keep the priced cart on the server. The order is later built only from this copy (by /verify or the
  // Razorpay webhook), so nothing the browser sends after payment can change items, prices or totals.
  await prisma.pendingCheckout.create({
    data: {
      razorpayOrderId: razorpayOrder.id,
      userId: user.id,
      amountPaise,
      summary: orderSummary,
      shippingAddress: normalizeShippingAddress(shippingAddress),
      notes: typeof notes === "string" && notes.trim() ? notes.trim().slice(0, 1000) : null,
    },
  });

  // Abandoned checkouts are not needed after a week (Razorpay orders can't be paid that late in practice)
  if (Math.random() < 0.02) {
    prisma.pendingCheckout
      .deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } })
      .catch(() => {});
  }

  return NextResponse.json({
    razorpayOrderId: razorpayOrder.id,
    keyId: process.env.RAZORPAY_KEY_ID,
    amount: razorpayOrder.amount,
    currency: razorpayOrder.currency,
    orderSummary,
    shippingAddress,
    notes,
  });
  } catch (error) {
    // The Razorpay SDK rejects with { statusCode, error: { code, description } } — not an Error — so read both shapes
    const rz = error as { statusCode?: number; error?: { code?: string; description?: string }; message?: string };
    const reason = rz.error?.description || rz.message || String(error);
    const fromRazorpay = typeof rz.statusCode === "number";
    console.error(`[payment/create-order]${fromRazorpay ? ` Razorpay ${rz.statusCode}` : ""}:`, reason);

    if (fromRazorpay) {
      // 401 = wrong/revoked RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET in .env
      return NextResponse.json(
        {
          message: "The payment gateway is unavailable right now. Please try again in a few minutes.",
          ...(process.env.NODE_ENV !== "production" && { detail: `Razorpay ${rz.statusCode}: ${reason}` }),
        },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { message: "Internal server error", ...(process.env.NODE_ENV !== "production" && { detail: reason }) },
      { status: 500 }
    );
  }
}
