-- AlterTable
ALTER TABLE "Combo" ADD COLUMN     "choiceCategoryId" INTEGER,
ADD COLUMN     "choiceQty" INTEGER,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "imageUrl" TEXT;

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "description" TEXT;

-- AlterTable
ALTER TABLE "Offer" ADD COLUMN     "maxDiscount" INTEGER,
ADD COLUMN     "minQty" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "OrderLine" ADD COLUMN     "choiceItemIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
