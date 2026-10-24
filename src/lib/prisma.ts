import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { exec } from "child_process";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const connectionString = process.env.DATABASE_URL!;

const adapter = new PrismaPg({ connectionString });

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// Self-migration for new schema columns and settings
if (process.env.NODE_ENV === "development") {
  prisma.$connect()
    .then(async () => {
      console.log("Migration: Running database self-migration...");
      
      // 1. Ensure rate_limit_buckets table exists for upload rate limiting
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "rate_limit_buckets" (
          "key" TEXT NOT NULL,
          "count" INTEGER NOT NULL,
          "windowStart" TIMESTAMP(3) NOT NULL,
          CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("key")
        );
        CREATE INDEX IF NOT EXISTS "rate_limit_buckets_windowStart_idx" ON "rate_limit_buckets"("windowStart");
      `).catch(err => console.error("Failed to ensure rate_limit_buckets table:", err));

      // 2. Ensure FranchiseInquiryStatus enum and status column exist
      await prisma.$executeRawUnsafe(`
        DO $$ BEGIN
          CREATE TYPE "FranchiseInquiryStatus" AS ENUM ('NEW', 'PENDING', 'CONTACTED');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `).catch(err => console.error("Failed to ensure FranchiseInquiryStatus enum:", err));

      // 3. Add image and status column to franchise_inquiries if they do not exist
      await prisma.$executeRawUnsafe(`
        ALTER TABLE franchise_inquiries 
        ADD COLUMN IF NOT EXISTS image TEXT;
        ALTER TABLE franchise_inquiries 
        ADD COLUMN IF NOT EXISTS "status" "FranchiseInquiryStatus" NOT NULL DEFAULT 'PENDING';
        ALTER TABLE franchise_inquiries 
        ALTER COLUMN "status" SET DEFAULT 'PENDING';
      `).catch(err => console.error("Failed to add image or status column:", err));

      // 2. Seed default settings for the franchises page
      const settingsToSeed = [
        { key: "franchise_hero_title", value: "Franchise Opportunity", group: "franchise" },
        { key: "franchise_hero_subtitle", value: "Be a part of Kiddos Foods family and grow with us", group: "franchise" },
        { key: "franchise_hero_image", value: "/images/franchisis/franchisis_hero.svg", group: "franchise" }
      ];

      for (const s of settingsToSeed) {
        await prisma.$executeRawUnsafe(`
          INSERT INTO settings (id, key, value, "group", "createdAt", "updatedAt")
          VALUES ('${s.key}', '${s.key}', '${s.value}', '${s.group}', NOW(), NOW())
          ON CONFLICT (key) DO NOTHING
        `).catch(err => console.error(`Failed to seed setting ${s.key}:`, err));
      }
      console.log("Migration: Database checks and settings seed complete.");

      // 3. Regenerate Prisma Client types
      console.log("Migration: Regenerating Prisma client...");
      exec("npx prisma generate", { cwd: process.cwd() }, (err, stdout, stderr) => {
        if (err) {
          console.error("Prisma generate error:", err);
        } else {
          console.log("Prisma generate output:", stdout);
        }
      });
    })
    .catch((err) => {
      console.error("Prisma self-migration connection failed:", err);
    });
}

