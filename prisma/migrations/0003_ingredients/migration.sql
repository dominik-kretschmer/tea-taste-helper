-- CreateEnum
CREATE TYPE "Caffeine" AS ENUM ('yes', 'no', 'unknown');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditEvent" ADD VALUE 'INGREDIENT_CREATED';
ALTER TYPE "AuditEvent" ADD VALUE 'INGREDIENT_UPDATED';

-- CreateTable
CREATE TABLE "Ingredient" (
    "id" UUID NOT NULL,
    "sourceLocale" VARCHAR(5) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ingredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngredientVersion" (
    "id" UUID NOT NULL,
    "ingredientId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "caffeine" "Caffeine" NOT NULL DEFAULT 'unknown',
    "brewTempC" SMALLINT,
    "brewSeconds" SMALLINT,
    "authorId" UUID,
    "note" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngredientVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngredientVersionTranslation" (
    "versionId" UUID NOT NULL,
    "locale" VARCHAR(5) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "nameKey" VARCHAR(80) NOT NULL,
    "description" VARCHAR(2000),

    CONSTRAINT "IngredientVersionTranslation_pkey" PRIMARY KEY ("versionId","locale")
);

-- CreateIndex
CREATE UNIQUE INDEX "IngredientVersion_ingredientId_version_key" ON "IngredientVersion"("ingredientId", "version");

-- CreateIndex
CREATE INDEX "IngredientVersionTranslation_locale_nameKey_idx" ON "IngredientVersionTranslation"("locale", "nameKey");

-- AddForeignKey
ALTER TABLE "IngredientVersion" ADD CONSTRAINT "IngredientVersion_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngredientVersion" ADD CONSTRAINT "IngredientVersion_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngredientVersionTranslation" ADD CONSTRAINT "IngredientVersionTranslation_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "IngredientVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Von Hand ergänzt. Erweiterung und partieller Unique-Index stehen nicht im Prisma-Schema; der
-- GIN-Index steht dort (type: Gin), muss aber nach der Erweiterung angelegt werden. Neue Migrationen
-- mit `prisma migrate dev --create-only` erzeugen und prüfen, dass sie nichts davon löschen.
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Genau eine aktuelle Version pro Zutat
CREATE UNIQUE INDEX "IngredientVersion_current_key"
  ON "IngredientVersion" ("ingredientId") WHERE "isCurrent";

-- Suche und Ähnlichkeit (über alle Namen; die Abfragen filtern per Join auf aktuelle Versionen)
CREATE INDEX "IngredientVersionTranslation_name_trgm"
  ON "IngredientVersionTranslation" USING gin (name gin_trgm_ops);
