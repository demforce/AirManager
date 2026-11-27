-- Legacy cycles remain NULL. Both a new cycle and a channel reactivation
-- draw from this sequence, so their relative order survives clock ties.
CREATE SEQUENCE "Expiry_notificationCycle_seq" AS integer;
ALTER TABLE "Expiry" ADD COLUMN "notificationCycle" integer;
ALTER SEQUENCE "Expiry_notificationCycle_seq" OWNED BY "Expiry"."notificationCycle";
ALTER TABLE "Expiry" ALTER COLUMN "notificationCycle" SET DEFAULT nextval('"Expiry_notificationCycle_seq"');

CREATE FUNCTION renew_expiry_notification_cycle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW."notificationCycle" := nextval('"Expiry_notificationCycle_seq"');
  RETURN NEW;
END;
$$;
CREATE TRIGGER expiry_notification_cycle_on_renewal
  BEFORE UPDATE OF "expiresAt" ON "Expiry"
  FOR EACH ROW WHEN (OLD."expiresAt" IS DISTINCT FROM NEW."expiresAt")
  EXECUTE FUNCTION renew_expiry_notification_cycle();
