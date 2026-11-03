-- Story 19.1 (R-19-a, CR PO 2026-11-01): the PPR / transit domain is dropped,
-- data included — test database, nothing to preserve.

-- 1. Data, while "pprRequestId" still exists. A storno inherits its original's
--    category, so the category filter catches the reversals too. The category
--    goes after its movements ("categoryId" is ON DELETE RESTRICT); a
--    "reversalOfId" pointing at a deleted row goes to NULL on its own (SET NULL).
DELETE FROM "CashMovement"
WHERE "pprRequestId" IS NOT NULL
   OR "categoryId" IN (SELECT "id" FROM "CashCategory" WHERE "name" = 'PPR');
DELETE FROM "CashCategory" WHERE "name" = 'PPR';
DELETE FROM "AppSetting" WHERE "key" IN ('ppr.landingFeeCents', 'ppr.operatingInstructions.it', 'ppr.operatingInstructions.en');
DELETE FROM "IdempotencyRecord" WHERE "endpoint" IN ('ppr-manual-create', 'ppr-approve', 'ppr-reject', 'ppr-complete', 'ppr-cancel');

-- 2. Schema. The "PprRequest" foreign keys to "User" fall with the table.
ALTER TABLE "CashMovement" DROP CONSTRAINT "CashMovement_pprRequestId_fkey";
DROP INDEX "CashMovement_pprRequestId_idx";
ALTER TABLE "CashMovement" DROP COLUMN "pprRequestId";
DROP TABLE "PprRequest";
DROP TABLE "PprCounter";
DROP TYPE "PprStatus";
