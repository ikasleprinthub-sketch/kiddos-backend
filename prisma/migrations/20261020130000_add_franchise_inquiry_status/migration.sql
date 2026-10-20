-- CreateEnum
CREATE TYPE "FranchiseInquiryStatus" AS ENUM ('NEW', 'PENDING', 'CONTACTED');

-- AlterTable: existing inquiries start as NEW
ALTER TABLE "franchise_inquiries" ADD COLUMN     "status" "FranchiseInquiryStatus" NOT NULL DEFAULT 'NEW';
