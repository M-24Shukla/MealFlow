ALTER TABLE "vacations"
  ADD COLUMN "start_meal" "meal_type" DEFAULT 'BREAKFAST' NOT NULL,
  ADD COLUMN "end_meal" "meal_type" DEFAULT 'DINNER' NOT NULL;

ALTER TABLE "vacations"
  DROP CONSTRAINT "vacations_date_range_check",
  ADD CONSTRAINT "vacations_date_range_check"
    CHECK ("start_date" < "end_date" OR ("start_date" = "end_date" AND "start_meal" <= "end_meal"));

ALTER TABLE "vacations"
  ALTER COLUMN "start_meal" DROP DEFAULT,
  ALTER COLUMN "end_meal" DROP DEFAULT;
