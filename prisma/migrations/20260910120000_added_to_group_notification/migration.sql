-- Telling somebody they have been admitted to a group.
--
-- The subject is the group, so an admin who revokes and re-admits the same person settles at
-- one row rather than accumulating them, and the panel row has somewhere to go when tapped.
--
-- `org_id` is a third nullable link beside `post_id` and `signup_sheet_id`, for the reason the
-- second one exists: the event is about a group and nothing else on the row can carry one. It
-- is what lets the panel name the parish without a query per row.
ALTER TYPE "notification_type" ADD VALUE 'ADDED_TO_GROUP';

ALTER TABLE "notification" ADD COLUMN "org_id" TEXT;

CREATE INDEX "notification_org_id_idx" ON "notification"("org_id");

ALTER TABLE "notification" ADD CONSTRAINT "notification_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
