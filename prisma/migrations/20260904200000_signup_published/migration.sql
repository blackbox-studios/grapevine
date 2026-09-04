-- Telling a parish that a new rota exists.
--
-- A fan-out, like NEW_POST and for the same reason: a sign-up sheet nobody knows about gets no
-- volunteers, and the parish should not have to go looking.
--
-- `signup_sheet_id` is separate from `signup_slot_id` because the two events happen at
-- different granularities: a reminder and a cancellation are about one *date*, a publication is
-- about the *rota*. Pointing a publication at the sheet's first slot would read fine until an
-- admin removed that date, at which point the cascade would take the announcement of the whole
-- rota with it.
ALTER TYPE "notification_type" ADD VALUE 'SIGNUP_PUBLISHED';

ALTER TABLE "notification" ADD COLUMN "signup_sheet_id" TEXT;

CREATE INDEX "notification_signup_sheet_id_idx" ON "notification"("signup_sheet_id");

ALTER TABLE "notification" ADD CONSTRAINT "notification_signup_sheet_id_fkey"
    FOREIGN KEY ("signup_sheet_id") REFERENCES "signup_sheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
