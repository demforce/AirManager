BEGIN;

-- The HTTP validators accept ASCII mailboxes after ECMAScript trim/lowercase.
-- Include the full trim set for older imports; "C" keeps ASCII case independent
-- of the database locale. Preserve the original column and its Prisma unique key.
CREATE FUNCTION airmanager_canonical_email(text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $canonical$
  -- ECMAScript also lowercases the Kelvin sign to ASCII k.
  SELECT lower(btrim(translate($1, U&'\212A', 'K'), U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') COLLATE "C")
$canonical$;

-- Block competing user writes until the check and index agree. Abort with a
-- generic diagnosis instead of exposing a conflicting mailbox in the index error.
LOCK TABLE "User" IN SHARE MODE;
DO $preflight$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "User" GROUP BY airmanager_canonical_email(email) COLLATE "C" HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Canonical account email collision. Resolve ownership before applying this migration.';
  END IF;
END
$preflight$;

CREATE UNIQUE INDEX "User_canonical_email_key" ON "User" (airmanager_canonical_email(email) COLLATE "C");
COMMIT;
