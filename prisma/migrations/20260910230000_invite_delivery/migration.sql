-- The invitation letter becomes a queue rather than a send fired during the request.
--
-- Sending inline lost the letter for good whenever the provider refused it: a daily quota
-- reached halfway through a roster, or a serverless instance frozen the moment it responded,
-- left people admitted and never told, with nothing anywhere to retry from. `Invite` already
-- had exactly one row per admission, so it is the queue.
--
-- `next_attempt_at` NULL means no letter is owed, which is the ordinary case for somebody who
-- has signed in before and is told by push instead. Existing rows are historical admissions
-- whose letters have already gone, and they take that NULL, so this migration needs no
-- backfill and cannot make the first sweep re-send anything.
ALTER TABLE "invite" ADD COLUMN "sent_at" TIMESTAMP(3);
ALTER TABLE "invite" ADD COLUMN "next_attempt_at" TIMESTAMP(3);
ALTER TABLE "invite" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "invite_sent_at_next_attempt_at_idx" ON "invite"("sent_at", "next_attempt_at");
