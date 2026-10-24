-- CreateTable
CREATE TABLE "PantryItem" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "ingredientId" UUID,
    "teaId" UUID,
    "grams" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PantryItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PantryItem_ingredientId_idx" ON "PantryItem"("ingredientId");

-- CreateIndex
CREATE INDEX "PantryItem_teaId_idx" ON "PantryItem"("teaId");

-- CreateIndex
CREATE UNIQUE INDEX "PantryItem_userId_ingredientId_key" ON "PantryItem"("userId", "ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "PantryItem_userId_teaId_key" ON "PantryItem"("userId", "teaId");

-- AddForeignKey
ALTER TABLE "PantryItem" ADD CONSTRAINT "PantryItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PantryItem" ADD CONSTRAINT "PantryItem_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PantryItem" ADD CONSTRAINT "PantryItem_teaId_fkey" FOREIGN KEY ("teaId") REFERENCES "Tea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Genau eine Zutat oder ein Tee je Eintrag (Prisma kennt keine CHECK-Constraints)
ALTER TABLE "PantryItem" ADD CONSTRAINT "PantryItem_one_target" CHECK (num_nonnulls("ingredientId", "teaId") = 1);
