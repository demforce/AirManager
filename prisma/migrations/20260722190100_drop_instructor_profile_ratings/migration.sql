-- Hand-written (TD-2 pattern, story 13.1, AC 4; R-13.1-b): drops the
-- free-text `InstructorProfile.ratings` column. The old free text is NOT
-- migrated into `Expiry` rows — parsing arbitrary strings like
-- "SEP(land), FI(A)" into catalogue `ExpiryType` ids would be unreliable
-- (decision R-13.1-b) — existing instructors' abilitazioni are reassigned
-- manually from the catalogue going forward (same mechanism piloti already
-- use: `Expiry` rows on `ExpiryType`s scoped `INSTRUCTORS`).

-- AlterTable
ALTER TABLE "InstructorProfile" DROP COLUMN "ratings";
