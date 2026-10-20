import { prisma } from "@/lib/prisma";

export const DELIVERY_FIELDS = ["name", "phone", "addressLine1", "addressLine2", "city", "state", "pincode"] as const;
export type DeliveryField = (typeof DELIVERY_FIELDS)[number];
export type DeliveryFieldConfig = Record<DeliveryField, boolean>;
export type ShippingAddressInput = Partial<Record<DeliveryField, unknown>>;

export const DELIVERY_SETTINGS_GROUP = "delivery";

// Used until the admin saves a different choice for a field
export const DEFAULT_DELIVERY_FIELD_CONFIG: DeliveryFieldConfig = {
  name: true,
  phone: true,
  addressLine1: true,
  addressLine2: false,
  city: true,
  state: true,
  pincode: true,
};

export const FIELD_LABELS: Record<DeliveryField, string> = {
  name: "Full name",
  phone: "Mobile number",
  addressLine1: "Address line 1",
  addressLine2: "Address line 2",
  city: "City",
  state: "State",
  pincode: "Pincode",
};

export const deliveryFieldSettingKey = (field: DeliveryField) => `delivery_field_${field}_required`;

/** Reads the admin's Required/Optional choices, falling back to the defaults for anything unsaved. */
export async function getDeliveryFieldConfig(): Promise<DeliveryFieldConfig> {
  const rows = await prisma.setting.findMany({
    where: { key: { in: DELIVERY_FIELDS.map(deliveryFieldSettingKey) } },
    select: { key: true, value: true },
  });
  const saved = new Map(rows.map((r) => [r.key, r.value]));
  const config = { ...DEFAULT_DELIVERY_FIELD_CONFIG };
  for (const field of DELIVERY_FIELDS) {
    const value = saved.get(deliveryFieldSettingKey(field));
    if (value === "true" || value === "false") config[field] = value === "true";
  }
  return config;
}

/**
 * Validates an address against the config. Required fields must be non-empty; optional fields
 * may be empty but, when filled, must still be well formed (phone / pincode).
 * Returns an error message, or null when the address is acceptable.
 */
export function validateShippingAddress(address: ShippingAddressInput | undefined | null, config: DeliveryFieldConfig): string | null {
  if (!address || typeof address !== "object") return "Shipping address is required";
  for (const field of DELIVERY_FIELDS) {
    const value = address[field];
    if (value != null && typeof value !== "string") return `${FIELD_LABELS[field]} is invalid`;
    const text = (value ?? "").toString().trim();
    if (!text) {
      if (config[field]) return `${FIELD_LABELS[field]} is required`;
      continue;
    }
    // Name: starts with a letter; letters (any language), spaces, . ' - only — no digit-only names
    if (field === "name" && !/^\p{L}[\p{L}\p{M}\s.'-]{1,99}$/u.test(text)) return "Enter a valid name (letters and spaces only)";
    if (field === "phone" && !/^[6-9]\d{9}$/.test(text)) return "Enter a valid 10-digit mobile number";
    if (field === "pincode" && !/^\d{6}$/.test(text)) return "Enter a valid 6-digit pincode";
  }
  return null;
}

/** Keeps only the known address fields, as trimmed strings (empty string for a missing optional field). */
export function normalizeShippingAddress(address: ShippingAddressInput): Record<DeliveryField, string> {
  const out = {} as Record<DeliveryField, string>;
  for (const field of DELIVERY_FIELDS) out[field] = (address[field] ?? "").toString().trim();
  return out;
}
