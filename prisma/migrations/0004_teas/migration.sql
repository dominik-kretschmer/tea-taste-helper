-- CreateEnum
CREATE TYPE "TeaKind" AS ENUM ('bought', 'blended');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('private', 'public');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditEvent" ADD VALUE 'TEA_CREATED';
ALTER TYPE "AuditEvent" ADD VALUE 'TEA_UPDATED';
ALTER TYPE "AuditEvent" ADD VALUE 'TEA_PUBLISHED';
ALTER TYPE "AuditEvent" ADD VALUE 'TEA_DELETED';

-- CreateTable
CREATE TABLE "Tea" (
    "id" UUID NOT NULL,
    "sourceLocale" VARCHAR(5) NOT NULL,
    "ownerId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeaVersion" (
    "id" UUID NOT NULL,
    "teaId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "visibility" "Visibility" NOT NULL DEFAULT 'private',
    "kind" "TeaKind" NOT NULL,
    "brand" VARCHAR(80),
    "brandKey" TEXT NOT NULL DEFAULT '',
    "caffeine" "Caffeine" NOT NULL DEFAULT 'unknown',
    "brewTempC" SMALLINT,
    "brewSeconds" SMALLINT,
    "authorId" UUID,
    "note" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeaVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeaVersionTranslation" (
    "versionId" UUID NOT NULL,
    "locale" VARCHAR(5) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "nameKey" TEXT NOT NULL,
    "description" VARCHAR(2000),

    CONSTRAINT "TeaVersionTranslation_pkey" PRIMARY KEY ("versionId","locale")
);

-- CreateTable
CREATE TABLE "TeaVersionIngredient" (
    "versionId" UUID NOT NULL,
    "position" SMALLINT NOT NULL,
    "ingredientId" UUID NOT NULL,
    "percent" SMALLINT,

    CONSTRAINT "TeaVersionIngredient_pkey" PRIMARY KEY ("versionId","position")
);

-- CreateIndex
CREATE INDEX "Tea_ownerId_idx" ON "Tea"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "TeaVersion_teaId_version_key" ON "TeaVersion"("teaId", "version");

-- CreateIndex
CREATE INDEX "TeaVersionTranslation_locale_nameKey_idx" ON "TeaVersionTranslation"("locale", "nameKey");

-- CreateIndex
CREATE INDEX "TeaVersionTranslation_name_trgm" ON "TeaVersionTranslation" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "TeaVersionIngredient_ingredientId_idx" ON "TeaVersionIngredient"("ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "TeaVersionIngredient_versionId_ingredientId_key" ON "TeaVersionIngredient"("versionId", "ingredientId");

-- AddForeignKey
ALTER TABLE "Tea" ADD CONSTRAINT "Tea_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeaVersion" ADD CONSTRAINT "TeaVersion_teaId_fkey" FOREIGN KEY ("teaId") REFERENCES "Tea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeaVersion" ADD CONSTRAINT "TeaVersion_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeaVersionTranslation" ADD CONSTRAINT "TeaVersionTranslation_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "TeaVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeaVersionIngredient" ADD CONSTRAINT "TeaVersionIngredient_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "TeaVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeaVersionIngredient" ADD CONSTRAINT "TeaVersionIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Von Hand ergänzt. Der partielle Unique-Index steht nicht im Prisma-Schema. Neue Migrationen mit
-- `prisma migrate dev --create-only` erzeugen und prüfen, dass sie ihn nicht löschen.
-- ---------------------------------------------------------------------------

-- Genau eine aktuelle Version pro Tee
CREATE UNIQUE INDEX "TeaVersion_current_key"
  ON "TeaVersion" ("teaId") WHERE "isCurrent";
