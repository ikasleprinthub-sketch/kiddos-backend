import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { razorpay } from "@/lib/razorpay";

interface CartItem {
  productId: string;
  quantity: number;
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
  try {
  const user = getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ message: "Authentication required" }, { status: 401 });
  }

  const body = await request.json();
  const { items, shippingAddress, couponCode, notes } = body as {
    items: CartItem[];
    shippingAddress: ShippingAddress;
    couponCode?: string;
    notes?: string;
  };

  if (!items?.length) {
    return NextResponse.json({ message: "Cart is empty" }, { status: 400 });
  }

  if (!shippingAddress?.name || !shippingAddress?.phone || !shippingAddress?.addressLine1 || !shippingAddress?.pincode) {
    return NextResponse.json({ message: "Complete shipping address is required" }, { status: 400 });
  }

  // Load and validate products
  const productIds = items.map((i) => i.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, isActive: true },
    select: { id: true, name: true, price: true, salePrice: true, stock: true, isActive: true },
  });

  if (products.length !== items.length) {
    return NextResponse.json({ message: "One or more products are unavailable" }, { status: 400 });
  }

  // Verify stock
  for (const item of items) {
    const product = products.find((p) => p.id === item.productId)!;
    if (product.stock < item.quantity) {
      return NextResponse.json(
        { message: `Insufficient stock for "${product.name ?? "Unnamed Product"}" (available: ${product.stock})` },
        { status: 400 }
      );
    }
  }

  // Calculate subtotal — prefer salePrice when set
  const lineItems = items.map((item) => {
    const product = products.find((p) => p.id === item.productId)!;
    const unitPrice = product.salePrice != null ? Number(product.salePrice) : Number(product.price);
    return { ...item, unitPrice, lineTotal: unitPrice * item.quantity, productName: product.name ?? "Unnamed Product" };
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

  // Delivery fee (free above ₹500)
  const deliveryFee = subtotal - discount >= 500 ? 0 : 50;

  const total = Math.max(0, subtotal - discount + deliveryFee);

  // Create Razorpay order (amount in paise)
const razorpayOrder = await razorpay.orders.create({
    amount: Math.round(total * 100),
    currency: "INR",
    receipt: `kiddos_${Date.now()}`,
    notes: {
      userId: user.id,
      couponCode: couponCode || "",
    },
  });

  return NextResponse.json({
    razorpayOrderId: razorpayOrder.id,
    keyId: process.env.RAZORPAY_KEY_ID,
    amount: razorpayOrder.amount,
    currency: razorpayOrder.currency,
    orderSummary: {
      subtotal: subtotal.toFixed(2),
      discount: discount.toFixed(2),
      deliveryFee: deliveryFee.toFixed(2),
      total: total.toFixed(2),
      couponCode: coupon?.code || null,
      lineItems,
    },
    shippingAddress,
    notes,
  });
  } catch (error) {
    console.error("[payment/create-order]", error);
    return NextResponse.json(
      { message: "Internal server error", detail: (error as Error).message },
      { status: 500 }
    );
  }
}
