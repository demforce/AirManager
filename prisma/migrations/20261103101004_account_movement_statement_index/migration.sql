-- Story 19.11 (CR PO 2026-11-01, R-19-n, A13, D-3): the estratto conto reads one account's movements
-- by value date with the running balance summed in (effectiveDate, createdAt, id) order — the index
-- is that key, so the window function and the period bound read rows already ordered. It REPLACES
-- the plain accountId index: the prefix still serves the balance aggregate, the overview preview and the FK.

-- DropIndex
DROP INDEX "AccountMovement_accountId_idx";

-- CreateIndex
CREATE INDEX "AccountMovement_accountId_effectiveDate_createdAt_id_idx" ON "AccountMovement"("accountId", "effectiveDate", "createdAt", "id");
