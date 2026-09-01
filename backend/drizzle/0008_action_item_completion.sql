ALTER TABLE "action_items" ADD COLUMN "completed_by_membership_id" uuid REFERENCES "memberships"("id") ON DELETE SET NULL;
