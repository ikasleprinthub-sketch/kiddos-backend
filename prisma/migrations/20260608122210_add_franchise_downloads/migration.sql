-- AlterEnum
ALTER TYPE "OTPType" ADD VALUE 'DOWNLOAD_VERIFICATION';

-- CreateTable
CREATE TABLE "franchise_downloads" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "franchise_downloads_pkey" PRIMARY KEY ("id")
);
