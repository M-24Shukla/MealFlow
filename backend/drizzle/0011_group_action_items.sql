ALTER TABLE "action_items" ADD COLUMN "group_id" uuid;
ALTER TABLE "action_items" ADD COLUMN "due_date" date;

UPDATE "action_items" AS action_item
SET "group_id" = occurrence."group_id",
    "due_date" = occurrence."meal_date"
FROM "meal_occurrences" AS occurrence
WHERE action_item."occurrence_id" = occurrence."id";

ALTER TABLE "action_items" ALTER COLUMN "group_id" SET NOT NULL;
ALTER TABLE "action_items" ALTER COLUMN "due_date" SET NOT NULL;
ALTER TABLE "action_items" ALTER COLUMN "occurrence_id" DROP NOT NULL;
UPDATE "action_items" SET "occurrence_id" = NULL;
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade;

DROP INDEX IF EXISTS "action_items_occurrence_completed_idx";
CREATE INDEX "action_items_group_due_completed_idx" ON "action_items" USING btree ("group_id", "due_date", "completed");
