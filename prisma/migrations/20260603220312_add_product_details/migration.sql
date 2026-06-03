-- AlterTable
ALTER TABLE "products" ADD COLUMN     "healthBenefits" TEXT,
ADD COLUMN     "ingredients" TEXT,
ADD COLUMN     "nutrientFacts" JSONB,
ADD COLUMN     "shelfLife" TEXT,
ADD COLUMN     "storageInstructions" TEXT,
ADD COLUMN     "usageInstructions" TEXT;
