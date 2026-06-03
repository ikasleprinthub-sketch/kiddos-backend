import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";

export interface TokenPayload {
  id: string;
  role: "ADMIN" | "USER";
}

const JWT_SECRET = process.env.JWT_SECRET || "kiddos_super_secret_dev_key_at_least_32_characters";

export function generateToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch (error) {
    return null;
  }
}

export function getUserFromRequest(request: NextRequest): TokenPayload | null {
  // 1. Check Authorization Header: Bearer <token>
  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    return verifyToken(token);
  }

  // 2. Check Cookie: token
  const tokenCookie = request.cookies.get("token");
  if (tokenCookie?.value) {
    return verifyToken(tokenCookie.value);
  }

  return null;
}

export function authorizeAdmin(request: NextRequest): TokenPayload | null {
  const user = getUserFromRequest(request);
  if (!user || user.role !== "ADMIN") {
    return null;
  }
  return user;
}
