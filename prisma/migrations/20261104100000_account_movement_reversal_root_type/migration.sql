-- Story 16.6b (ledger MINOR-3, ratifica PO 2026-11-03; review F5 fix,
-- ratifica PO 2026-11-04): a reversal chain's LINKS take the BOOK of the
-- chain's ROOT, at any depth. A Prisma `where` cannot climb `reversalOf` to
-- an arbitrary depth, so the root's book is stored on each linked row at
-- write time (the chain is linear — `reversalOfId` is unique — and
-- append-only, so the root never changes after the insert).
--
-- The column stores the ROOT's BOOK, not its raw type (the first cut of this
-- migration did): a root TYPE alone cannot tell a giroconto (a standalone
-- CREDIT `ADJUSTMENT`, book TRANSFER) from a quota/addebito (a standalone
-- DEBIT `ADJUSTMENT`, book REVENUE) — both are type `ADJUSTMENT`. The
-- mapping below mirrors `src/lib/schemas/transactions.ts#rootBookType`
-- exactly (the one place "what book does this type+sign belong to" is
-- decided) — see that function's doc-comment for the case-by-case rule this
-- CTE reproduces in SQL for the one-time backfill.

-- CreateEnum
CREATE TYPE "AccountMovementRootBook" AS ENUM ('DEPOSIT', 'REVENUE', 'TRANSFER');

-- AlterTable
ALTER TABLE "AccountMovement" ADD COLUMN     "reversalRootBook" "AccountMovementRootBook";

-- Backfill: walk every linked row up to the original that links to nothing
-- (`parent IS NULL`) and classify THAT root's own type/amount. Any depth; a
-- root of a legacy type (`FLIGHT_CHARGE`, before story 19.6 made it
-- unadjustable) maps to REVENUE, same as `rootBookType`.
WITH RECURSIVE chain AS (
  SELECT m."id" AS leaf, o."reversalOfId" AS parent, o."type" AS node_type, o."amountCents" AS node_amount
  FROM "AccountMovement" m
  JOIN "AccountMovement" o ON o."id" = m."reversalOfId"
  UNION ALL
  SELECT c.leaf, p."reversalOfId", p."type", p."amountCents"
  FROM chain c
  JOIN "AccountMovement" p ON p."id" = c.parent
)
UPDATE "AccountMovement" m
SET "reversalRootBook" = (CASE
  WHEN c.node_type = 'TOP_UP' THEN 'DEPOSIT'
  WHEN c.node_type = 'FLIGHT_CHARGE' THEN 'REVENUE'
  WHEN c.node_type = 'PACKAGE_PURCHASE' THEN 'TRANSFER'
  WHEN c.node_amount < 0 THEN 'REVENUE'
  ELSE 'TRANSFER'
END)::"AccountMovementRootBook"
FROM chain c
WHERE c.leaf = m."id" AND c.parent IS NULL;

-- The invariant, held by the DB: a writer that links a row and forgets its
-- root book fails loudly instead of writing a row every book predicate
-- would silently misclassify. Not modelled by Prisma (no CHECK support in
-- the schema), so `migrate diff` neither creates nor drops it.
--
-- Review 16.6b F3: this CHECK makes "AccountMovement_reversalOfId_fkey"'s
-- `ON DELETE SET NULL` (20260705190000_add_accounts_topups) a RESTRICT in
-- practice for any row that has a linked reversal: the FK's SET NULL would
-- leave `reversalOfId` NULL with `reversalRootBook` still set, which this
-- CHECK rejects (23514) — so deleting a reversed row now fails instead of
-- orphaning its reversal with a stale root book. No code path reaches this
-- today (`deleteFlight` refuses to delete an adjusted `FLIGHT_CHARGE`
-- first, and nothing else deletes an `AccountMovement`); a future bulk
-- delete or data migration is the one that would hit it.
ALTER TABLE "AccountMovement" ADD CONSTRAINT "AccountMovement_reversalRootBook_check"
  CHECK (("reversalOfId" IS NULL) = ("reversalRootBook" IS NULL));
