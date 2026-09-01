CREATE TABLE "vacations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "membership_id" uuid NOT NULL REFERENCES "memberships"("id") ON DELETE CASCADE,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "vacations_date_range_check" CHECK ("start_date" <= "end_date")
);

CREATE INDEX "vacations_membership_start_date_idx"
  ON "vacations" USING btree ("membership_id", "start_date");
