-- Lookup keys for historical spellings. These indexes are non-unique:
-- equivalent addresses on different owners are valid input to the inventory.
-- Follow ECMAScript trim and the letters that lowercase to ASCII in singleMailbox.
-- Controls are deliberately retained (singleMailbox rejects them).
CREATE FUNCTION airmanager_mailbox_key(mailbox text) RETURNS text
LANGUAGE SQL IMMUTABLE STRICT PARALLEL SAFE
RETURN pg_catalog.translate(
    pg_catalog.btrim(mailbox, U&' \00a0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200a\2028\2029\202f\205f\3000\feff'),
    'ABCDEFGHIJKLMNOPQRSTUVWXYZK', 'abcdefghijklmnopqrstuvwxyzk'
);
CREATE INDEX "Person_trial_mailbox_idx" ON "Person" ((airmanager_mailbox_key(email) COLLATE "C")) WHERE email IS NOT NULL;
CREATE INDEX "User_trial_mailbox_idx" ON "User" ((airmanager_mailbox_key(email) COLLATE "C"));
