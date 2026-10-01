-- DropIndex
DROP INDEX "Order_businessDate_idx";

-- CreateIndex
CREATE INDEX "Order_businessDate_status_idx" ON "Order"("businessDate", "status");

-- CreateIndex
CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");

-- CreateIndex
CREATE INDEX "OrderLine_orderId_idx" ON "OrderLine"("orderId");

-- CreateIndex
CREATE INDEX "OrderOffer_orderId_idx" ON "OrderOffer"("orderId");

-- CreateIndex
CREATE INDEX "OrderOffer_offerId_idx" ON "OrderOffer"("offerId");

-- CreateIndex
CREATE INDEX "StockMovement_itemId_idx" ON "StockMovement"("itemId");

