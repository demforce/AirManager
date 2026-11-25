-- Date-window reads in the transaction list and ledger statistics (17.4).
CREATE INDEX "AccountMovement_effectiveDate_idx" ON "AccountMovement"("effectiveDate");
CREATE INDEX "CashMovement_effectiveDate_idx" ON "CashMovement"("effectiveDate");
