import { createHmac, timingSafeEqual } from "crypto";

export interface CartItem {
  productId: string;
  variantId?: string;
  quantity: number;
}

export const MAX_CART_LINES = 50;
export const MAX_QUANTITY_PER_LINE = 1000;

const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 64;

/**
 * Validate the cart sent by the browser. Quantities must be whole numbers from 1 to MAX_QUANTITY_PER_LINE:
 * a negative, zero, fractional or string quantity would otherwise lower the bill or corrupt stock.
 */
export function parseCartItems(raw: unknown): { items: CartItem[] } | { error: string } {
  if (!Array.isArray(raw) || raw.length === 0) return { error: "Cart is empty" };
  if (raw.length > MAX_CART_LINES) return { error: `A cart can contain at most ${MAX_CART_LINES} different items` };

  const merged = new Map<string, CartItem>();
  for (const entry of raw) {
    const item = entry as Partial<CartItem> | null;
    if (!item || !isId(item.productId)) return { error: "Invalid product in cart" };
    if (item.variantId != null && item.variantId !== "" && !isId(item.variantId)) return { error: "Invalid product option in cart" };
    if (!Number.isInteger(item.quantity) || (item.quantity as number) < 1) return { error: "Invalid quantity in cart" };

    const variantId = item.variantId || undefined;
    const key = `${item.productId}:${variantId ?? ""}`;
    const existing = merged.get(key);
    const quantity = (existing?.quantity ?? 0) + (item.quantity as number);
    if (quantity > MAX_QUANTITY_PER_LINE) return { error: `You can order at most ${MAX_QUANTITY_PER_LINE} of one item` };
    merged.set(key, { productId: item.productId, variantId, quantity });
  }
  return { items: Array.from(merged.values()) };
}

/** Constant-time comparison for hex strings (signatures). */
export function safeEqualHex(a: unknown, b: unknown): boolean {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** HMAC-SHA256 hex digest, as Razorpay uses for payment and webhook signatures. */
export function hmacSha256Hex(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}
