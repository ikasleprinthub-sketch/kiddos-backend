import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Fixed-window rate limiting stored in PostgreSQL (table rate_limit_buckets), so the limit is shared
 * by every process/container and survives restarts. One atomic upsert per check — no read-then-write race.
 *
 * Returns true when the request is allowed, false when the limit for this window is used up.
 */
export async function consumeRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "rate_limit_buckets" ("key", "count", "windowStart")
    VALUES (${key}, 1, now())
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "rate_limit_buckets"."windowStart" <= now() - make_interval(secs => ${windowSeconds})
                     THEN 1 ELSE "rate_limit_buckets"."count" + 1 END,
      "windowStart" = CASE WHEN "rate_limit_buckets"."windowStart" <= now() - make_interval(secs => ${windowSeconds})
                           THEN now() ELSE "rate_limit_buckets"."windowStart" END
    RETURNING "count"`;

  // Occasionally drop buckets idle for over a day so the table stays small
  if (Math.random() < 0.01) {
    prisma.$executeRaw`DELETE FROM "rate_limit_buckets" WHERE "windowStart" < now() - interval '1 day'`.catch(() => {});
  }

  return Number(rows[0]?.count ?? 0) <= limit;
}

/**
 * Client IP, trusting X-Forwarded-For only as far as our own proxies.
 *
 * Next.js keeps an incoming X-Forwarded-For as-is (it only fills it when missing), so whatever a client sends
 * reaches this code. TRUSTED_PROXY_HOPS is the number of proxies we run in front of the app that APPEND the
 * address they saw (e.g. nginx `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` → 1).
 * The client address is then that many entries from the right; anything the client prepended is ignored.
 *
 * With the default of 0 nothing forwarded is trusted and null is returned — callers must then treat all
 * anonymous traffic as one client. Route handlers can't see the socket address, so this is the only safe option.
 * The app ports must not be reachable except through those proxies, or the header could be forged.
 */
export function trustedClientIp(request: NextRequest): string | null {
  const hops = Number.parseInt(process.env.TRUSTED_PROXY_HOPS || "0", 10);
  if (!Number.isInteger(hops) || hops <= 0) return null;

  const chain = (request.headers.get("x-forwarded-for") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const ip = chain[chain.length - hops];
  // Only accept something that looks like an IPv4/IPv6 address (no free-form keys)
  return ip && /^[0-9a-fA-F:.]{2,45}$/.test(ip) ? ip : null;
}
