-- CreateEnum
CREATE TYPE "CatalogType" AS ENUM ('ingredient', 'tea');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('duplicate', 'wrong_info', 'spam', 'inappropriate', 'other');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('open', 'resolved', 'rejected');

-- CreateEnum
CREATE TYPE "CatalogEventKind" AS ENUM ('hidden', 'restored', 'merged');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditEvent" ADD VALUE 'INGREDIENT_REVERTED';
ALTER TYPE "AuditEvent" ADD VALUE 'TEA_REVERTED';
ALTER TYPE "AuditEvent" ADD VALUE 'REPORT_CREATED';
ALTER TYPE "AuditEvent" ADD VALUE 'REPORT_RESOLVED';
ALTER TYPE "AuditEvent" ADD VALUE 'INGREDIENT_MERGED';
ALTER TYPE "AuditEvent" ADD VALUE 'TEA_MERGED';
ALTER TYPE "AuditEvent" ADD VALUE 'INGREDIENT_HIDDEN';
ALTER TYPE "AuditEvent" ADD VALUE 'INGREDIENT_RESTORED';
ALTER TYPE "AuditEvent" ADD VALUE 'TEA_HIDDEN';
ALTER TYPE "AuditEvent" ADD VALUE 'TEA_RESTORED';
ALTER TYPE "AuditEvent" ADD VALUE 'USER_BLOCKED';
ALTER TYPE "AuditEvent" ADD VALUE 'USER_UNBLOCKED';
ALTER TYPE "AuditEvent" ADD VALUE 'BULK_REVERT';

-- AlterTable
ALTER TABLE "Ingredient" ADD COLUMN     "hiddenAt" TIMESTAMP(3),
ADD COLUMN     "hiddenById" UUID,
ADD COLUMN     "hiddenReason" VARCHAR(500),
ADD COLUMN     "mergedAt" TIMESTAMP(3),
ADD COLUMN     "mergedIntoId" UUID;

-- AlterTable
ALTER TABLE "IngredientVersion" ADD COLUMN     "bulkRevertOfId" UUID,
ADD COLUMN     "revertedTo" SMALLINT;

-- AlterTable
ALTER TABLE "Tea" ADD COLUMN     "hiddenAt" TIMESTAMP(3),
ADD COLUMN     "hiddenById" UUID,
ADD COLUMN     "hiddenReason" VARCHAR(500),
ADD COLUMN     "mergedAt" TIMESTAMP(3),
ADD COLUMN     "mergedIntoId" UUID;

-- AlterTable
ALTER TABLE "TeaVersion" ADD COLUMN     "bulkRevertOfId" UUID,
ADD COLUMN     "mergedIngredientId" UUID,
ADD COLUMN     "revertedTo" SMALLINT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "blockReason" VARCHAR(500),
ADD COLUMN     "blockedById" UUID,
ADD COLUMN     "blockedUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Report" (
    "id" UUID NOT NULL,
    "entityType" "CatalogType" NOT NULL,
    "entityId" UUID NOT NULL,
    "reporterId" UUID,
    "reason" "ReportReason" NOT NULL,
    "comment" VARCHAR(500),
    "duplicateOfId" UUID,
    "status" "ReportStatus" NOT NULL DEFAULT 'open',
    "resolvedById" UUID,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogEvent" (
    "id" BIGSERIAL NOT NULL,
    "entityType" "CatalogType" NOT NULL,
    "entityId" UUID NOT NULL,
    "kind" "CatalogEventKind" NOT NULL,
    "actorId" UUID,
    "reason" VARCHAR(500),
    "targetId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Report_status_createdAt_idx" ON "Report"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Report_entityType_entityId_status_idx" ON "Report"("entityType", "entityId", "status");

-- CreateIndex
CREATE INDEX "CatalogEvent_entityType_entityId_createdAt_idx" ON "CatalogEvent"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "Ingredient_mergedIntoId_idx" ON "Ingredient"("mergedIntoId");

-- CreateIndex
CREATE INDEX "Ingredient_hiddenAt_idx" ON "Ingredient"("hiddenAt");

-- CreateIndex
CREATE INDEX "Tea_mergedIntoId_idx" ON "Tea"("mergedIntoId");

-- CreateIndex
CREATE INDEX "Tea_hiddenAt_idx" ON "Tea"("hiddenAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_blockedById_fkey" FOREIGN KEY ("blockedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_hiddenById_fkey" FOREIGN KEY ("hiddenById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngredientVersion" ADD CONSTRAINT "IngredientVersion_bulkRevertOfId_fkey" FOREIGN KEY ("bulkRevertOfId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tea" ADD CONSTRAINT "Tea_hiddenById_fkey" FOREIGN KEY ("hiddenById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tea" ADD CONSTRAINT "Tea_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "Tea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeaVersion" ADD CONSTRAINT "TeaVersion_bulkRevertOfId_fkey" FOREIGN KEY ("bulkRevertOfId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeaVersion" ADD CONSTRAINT "TeaVersion_mergedIngredientId_fkey" FOREIGN KEY ("mergedIngredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogEvent" ADD CONSTRAINT "CatalogEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 05-moderation, von Hand ergänzt (Prisma kennt beides nicht):
-- Höchstens eine offene Meldung je Nutzer und Eintrag (AK-2.4)
CREATE UNIQUE INDEX "Report_open_key" ON "Report" ("reporterId", "entityType", "entityId") WHERE status = 'open';

-- Zusammengeführt und ausgeblendet schließen sich aus
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_merged_not_hidden" CHECK ("mergedIntoId" IS NULL OR "hiddenAt" IS NULL);
ALTER TABLE "Tea" ADD CONSTRAINT "Tea_merged_not_hidden" CHECK ("mergedIntoId" IS NULL OR "hiddenAt" IS NULL);
