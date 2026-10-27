ALTER TABLE "orders"
ADD COLUMN "razorpayRefundId" TEXT,
ADD COLUMN "refundStatus" TEXT;

CREATE UNIQUE INDEX "orders_razorpayRefundId_key" ON "orders"("razorpayRefundId");
