CREATE TABLE "action_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "occurrence_id" uuid NOT NULL,
  "text" text NOT NULL,
  "completed" boolean DEFAULT false NOT NULL,
  "created_by_membership_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "action_items"
  ADD CONSTRAINT "action_items_occurrence_id_meal_occurrences_id_fk"
  FOREIGN KEY ("occurrence_id") REFERENCES "public"."meal_occurrences"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "action_items"
  ADD CONSTRAINT "action_items_created_by_membership_id_memberships_id_fk"
  FOREIGN KEY ("created_by_membership_id") REFERENCES "public"."memberships"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "action_items_occurrence_completed_idx"
  ON "action_items" USING btree ("occurrence_id", "completed");
