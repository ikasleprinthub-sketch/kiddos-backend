// Keep in sync with the frontend's lib/validation.ts (isValidEmail lives in services/email.service.ts)

/** Letters, spaces and dots, starting with a letter (rejects numeric-only names like "45885") */
export const isValidName = (v: unknown): v is string =>
  typeof v === "string" && /^[a-zA-Z][a-zA-Z\s.]{1,99}$/.test(v.trim());

/** Exactly 10 digits */
export const isValidMobile = (v: unknown): v is string => typeof v === "string" && /^\d{10}$/.test(v.trim());
