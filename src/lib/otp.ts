import { randomInt } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { consumeRateLimit, trustedClientIp } from "@/lib/rate-limit";

/** 6-digit one-time code from a cryptographically secure source (Math.random is predictable). */
export function generateOtp(): string {
  return String(randomInt(100000, 1000000));
}

/** Escape user-supplied text before putting it into an HTML email. */
export const escapeHtml = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

// A 6-digit code has 900,000 possibilities. Allowing only a few guesses per email per window makes
// guessing impractical even when an attacker keeps requesting new codes or spreads requests over many IPs.
const OTP_ATTEMPTS_PER_EMAIL = 5;
const OTP_WINDOW_S = 15 * 60;

/**
 * Count one OTP check for this email + purpose. Returns a 429 response once the limit is used up,
 * otherwise null. Call it BEFORE looking the code up, so wrong and right guesses both count.
 */
export async function limitOtpAttempts(purpose: string, email: string): Promise<NextResponse | null> {
  const ok = await consumeRateLimit(`otp:${purpose}:${email}`, OTP_ATTEMPTS_PER_EMAIL, OTP_WINDOW_S);
  if (ok) return null;
  return NextResponse.json(
    { message: "Too many attempts. Please wait 15 minutes and request a new code." },
    { status: 429, headers: { "Retry-After": String(OTP_WINDOW_S) } }
  );
}

// Emails we send on request of an anonymous visitor (sign-up OTP, reset code, brochure OTP, form
// notifications). Limits stop one address being flooded and stop the SMTP daily quota being used up.
const EMAILS_PER_ADDRESS = Number(process.env.EMAIL_LIMIT_PER_ADDRESS) || 3; // per 15 minutes
const EMAILS_PER_IP = Number(process.env.EMAIL_LIMIT_PER_IP) || 20; // per hour, when a trusted proxy reports the IP
const EMAILS_GLOBAL = Number(process.env.EMAIL_LIMIT_GLOBAL) || 300; // per hour, all visitors together

/** Rate limit a request that makes us send an email to `address`. Returns a 429 response or null. */
export async function limitEmailSends(request: NextRequest, purpose: string, address: string): Promise<NextResponse | null> {
  const ip = trustedClientIp(request);
  const ok =
    (await consumeRateLimit(`email:${purpose}:${address}`, EMAILS_PER_ADDRESS, 15 * 60)) &&
    (!ip || (await consumeRateLimit(`email:ip:${ip}`, EMAILS_PER_IP, 60 * 60))) &&
    (await consumeRateLimit("email:global", EMAILS_GLOBAL, 60 * 60));
  if (ok) return null;
  return NextResponse.json(
    { message: "Too many requests. Please wait a few minutes and try again." },
    { status: 429, headers: { "Retry-After": "900" } }
  );
}

const LOGIN_ATTEMPTS_PER_EMAIL = 10;
const LOGIN_ATTEMPTS_PER_IP = 50;
const LOGIN_WINDOW_S = 15 * 60;

/** Slow down password guessing: per account, and per client IP when a trusted proxy reports it. */
export async function limitLoginAttempts(request: NextRequest, email: string): Promise<NextResponse | null> {
  const ip = trustedClientIp(request);
  const perEmailOk = await consumeRateLimit(`login:email:${email}`, LOGIN_ATTEMPTS_PER_EMAIL, LOGIN_WINDOW_S);
  const perIpOk = !ip || (await consumeRateLimit(`login:ip:${ip}`, LOGIN_ATTEMPTS_PER_IP, LOGIN_WINDOW_S));
  if (perEmailOk && perIpOk) return null;
  return NextResponse.json(
    { message: "Too many login attempts. Please wait 15 minutes and try again." },
    { status: 429, headers: { "Retry-After": String(LOGIN_WINDOW_S) } }
  );
}
