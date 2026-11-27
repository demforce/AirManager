-- Remove the lookup objects together. An unexpected dependency must leave all three intact.
BEGIN;

DROP INDEX "Person_trial_mailbox_idx", "User_trial_mailbox_idx" RESTRICT;
DROP FUNCTION airmanager_mailbox_key(text) RESTRICT;

COMMIT;
