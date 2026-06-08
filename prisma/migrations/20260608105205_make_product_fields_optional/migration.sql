-- AlterTable
ALTER TABLE "franchise_inquiries" ADD COLUMN     "image" TEXT;

-- AlterTable
ALTER TABLE "products" ALTER COLUMN "name" DROP NOT NULL,
ALTER COLUMN "price" DROP NOT NULL;
