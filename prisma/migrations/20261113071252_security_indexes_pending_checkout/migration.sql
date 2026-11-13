-- AlterTable
ALTER TABLE "users" ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "pending_checkouts" (
    "razorpayOrderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "summary" JSONB NOT NULL,
    "shippingAddress" JSONB NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_checkouts_pkey" PRIMARY KEY ("razorpayOrderId")
);

-- CreateIndex
CREATE INDEX "pending_checkouts_createdAt_idx" ON "pending_checkouts"("createdAt");

-- CreateIndex
CREATE INDEX "order_items_orderId_idx" ON "order_items"("orderId");

-- CreateIndex
CREATE INDEX "order_items_productId_idx" ON "order_items"("productId");

-- CreateIndex
CREATE INDEX "order_items_variantId_idx" ON "order_items"("variantId");

-- CreateIndex
CREATE INDEX "orders_userId_createdAt_idx" ON "orders"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "orders_createdAt_idx" ON "orders"("createdAt");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "orders_couponId_idx" ON "orders"("couponId");

-- CreateIndex
CREATE INDEX "otps_email_type_idx" ON "otps"("email", "type");

-- CreateIndex
CREATE INDEX "product_images_productId_idx" ON "product_images"("productId");

-- CreateIndex
CREATE INDEX "product_variants_productId_idx" ON "product_variants"("productId");

-- CreateIndex
CREATE INDEX "products_categoryId_idx" ON "products"("categoryId");

-- Default franchise-page settings (previously inserted by src/lib/prisma.ts on every dev start).
-- Existing values are kept.
INSERT INTO "settings" ("id", "key", "value", "group", "createdAt", "updatedAt") VALUES
  ('franchise_hero_title', 'franchise_hero_title', 'Franchise Opportunity', 'franchise', NOW(), NOW()),
  ('franchise_hero_subtitle', 'franchise_hero_subtitle', 'Be a part of Kiddos Foods family and grow with us', 'franchise', NOW(), NOW()),
  ('franchise_hero_image', 'franchise_hero_image', '/images/franchisis/franchisis_hero.svg', 'franchise', NOW(), NOW())
ON CONFLICT ("key") DO NOTHING;
