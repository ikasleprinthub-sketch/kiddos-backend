import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export interface TokenPayload {
  id: string;
  role: "ADMIN" | "USER";
  /** users.tokenVersion when the token was issued (missing on tokens from before this field existed = 0) */
  tv?: number;
}

/**
 * The signing secret must come from the environment. There is deliberately no fallback:
 * a default value in the source code would let anyone forge tokens (including ADMIN ones).
 * Read lazily so `next build` works without secrets; every sign/verify call checks it.
 */
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be set to a random string of at least 32 characters");
  }
  return secret;
}

export function generateToken(payload: TokenPayload): string {
  return jwt.sign(payload, getJwtSecret(), {
    algorithm: "HS256",
    expiresIn: (process.env.JWT_EXPIRES_IN || "7d") as jwt.SignOptions["expiresIn"],
  });
}

export function verifyToken(token: string): TokenPayload | null {
  const secret = getJwtSecret(); // a missing secret is a server error, not an "invalid token"
  try {
    return jwt.verify(token, secret, { algorithms: ["HS256"] }) as TokenPayload;
  } catch {
    return null;
  }
}

function readToken(request: NextRequest): TokenPayload | null {
  // 1. Check Authorization Header: Bearer <token>
  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return verifyToken(authHeader.substring(7));
  }

  // 2. Check Cookie: token
  const tokenCookie = request.cookies.get("token");
  if (tokenCookie?.value) {
    return verifyToken(tokenCookie.value);
  }

  return null;
}

/**
 * The signed-in user, checked against the database on every request — not just the token.
 * Returns null when the token is missing/invalid, the account was deleted, suspended or never verified,
 * or the token was issued before the account's tokenVersion changed (password reset, suspension, role change).
 * The role always comes from the database, so removing someone's admin role takes effect immediately.
 */
export async function getUserFromRequest(request: NextRequest): Promise<TokenPayload | null> {
  const token = readToken(request);
  if (!token?.id) return null;

  const user = await prisma.user.findUnique({
    where: { id: token.id },
    select: { id: true, role: true, isActive: true, isVerified: true, tokenVersion: true },
  });
  if (!user || !user.isActive || !user.isVerified) return null;
  if ((token.tv ?? 0) !== user.tokenVersion) return null;

  return { id: user.id, role: user.role, tv: user.tokenVersion };
}

export async function authorizeAdmin(request: NextRequest): Promise<TokenPayload | null> {
  const user = await getUserFromRequest(request);
  if (!user || user.role !== "ADMIN") {
    return null;
  }
  return user;
}

/** Log the user out everywhere: every token issued so far stops working. */
export async function revokeUserSessions(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
}
