ALTER TABLE "feedback" ADD COLUMN "occurrence_item_id" uuid REFERENCES "meal_occurrence_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
DROP INDEX "feedback_occurrence_membership_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_occurrence_item_membership_unique" ON "feedback" USING btree ("occurrence_id","occurrence_item_id","membership_id");--> statement-breakpoint
CREATE INDEX "feedback_occurrence_item_created_at_idx" ON "feedback" USING btree ("occurrence_item_id","created_at");
