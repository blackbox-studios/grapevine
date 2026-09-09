-- Whether taking a date on this rota shows what the Church keeps that day.
--
-- A rota about food is a rota about the fast: somebody signing up for coffee hour three Sundays
-- out is deciding what to cook, and whether that day is a fast decides it. The rule itself is
-- not stored here and must not be — it is read per date from the same almanac the Daily Read
-- uses, because it is a fact about a date rather than about this parish's rota.
--
-- Defaults false, which is what every existing row means: it belongs on the kitchen and coffee
-- hour, and says nothing on a cleaning rota.
ALTER TABLE "signup_sheet" ADD COLUMN "show_fasting" BOOLEAN NOT NULL DEFAULT false;
