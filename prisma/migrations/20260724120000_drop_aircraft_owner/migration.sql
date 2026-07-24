-- Hand-written (TD-2 pattern, story 13.4, AC 4): drops `Aircraft.owner` and
-- the `AircraftOwner` enum. The field was introduced in story 12.5 as
-- presentation/anagrafica only ("no pricing/booking behavior keys off
-- this" — its own doc-comment) and never fed any pricing/contaore
-- computation — removing it changes no other behavior. No data migration:
-- the CLUB/PRIVATE distinction carried no meaning anything else reads.

-- AlterTable
ALTER TABLE "Aircraft" DROP COLUMN "owner";

-- DropEnum
DROP TYPE "AircraftOwner";
