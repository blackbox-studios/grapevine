-- Rotas that go on indefinitely — "every Saturday, forever", which is what most of a parish's
-- standing rotas are. A festival's car park is the other kind: a fixed span that finishes.
--
-- Deliberately a flag and not a stored rule. Extending a weekly rota needs one thing the rows
-- already hold, the last day on it: the next occurrence is that day's slots a week later at the
-- same wall-clock time. So there is no second copy of the schedule to drift from the dates it
-- produced, and an admin who moves the rota to ten o'clock has moved every future one.
--
-- Defaults false, which is what every existing row means.
ALTER TABLE "signup_sheet" ADD COLUMN "repeats" BOOLEAN NOT NULL DEFAULT false;
