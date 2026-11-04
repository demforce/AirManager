-- Story 16.6b (ledger MINOR-3, ratifica PO 2026-11-03): the ROOT of a reversal
-- chain decides the book of every link, at any depth and sign. A Prisma `where`
-- cannot climb `reversalOf` to an arbitrary depth, so the root's type is stored
-- on each linked row at write time (the chain is linear — `reversalOfId` is
-- unique — and append-only, so the root never changes after the insert).

-- AlterTable
ALTER TABLE "AccountMovement" ADD COLUMN     "reversalRootType" "AccountMovementType";

-- Backfill: walk every linked row up to the original that links to nothing
-- (`parent IS NULL`) and copy that original's type. Any depth; a root of a
-- legacy type (`FLIGHT_CHARGE`, before story 19.6 made it unadjustable) is
-- copied as it is.
WITH RECURSIVE chain AS (
  SELECT m."id" AS leaf, o."reversalOfId" AS parent, o."type" AS node_type
  FROM "AccountMovement" m
  JOIN "AccountMovement" o ON o."id" = m."reversalOfId"
  UNION ALL
  SELECT c.leaf, p."reversalOfId", p."type"
  FROM chain c
  JOIN "AccountMovement" p ON p."id" = c.parent
)
UPDATE "AccountMovement" m
SET "reversalRootType" = c.node_type
FROM chain c
WHERE c.leaf = m."id" AND c.parent IS NULL;

-- The invariant, held by the DB: a writer that links a row and forgets its
-- root type fails loudly instead of writing a row every book predicate would
-- silently read as "not rooted in a TOP_UP". Not modelled by Prisma (no CHECK
-- support in the schema), so `migrate diff` neither creates nor drops it.
ALTER TABLE "AccountMovement" ADD CONSTRAINT "AccountMovement_reversalRootType_check"
  CHECK (("reversalOfId" IS NULL) = ("reversalRootType" IS NULL));
