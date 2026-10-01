-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "servedAt" TIMESTAMP(3),
ADD COLUMN     "servedById" INTEGER;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_servedById_fkey" FOREIGN KEY ("servedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

