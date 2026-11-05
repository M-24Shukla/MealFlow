ALTER TABLE "memberships" ADD COLUMN "diner_onboarding_completed_at" timestamp with time zone;

CREATE TABLE "diner_menu_item_absences" (
	"membership_id" uuid NOT NULL,
	"menu_item_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "diner_menu_item_absences_membership_id_menu_item_id_pk" PRIMARY KEY("membership_id","menu_item_id")
);

CREATE TABLE "diner_item_attendance_overrides" (
	"membership_id" uuid NOT NULL,
	"meal_date" date NOT NULL,
	"meal_type" "meal_type" NOT NULL,
	"item_id" uuid NOT NULL,
	"attendance" "attendance_status" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "diner_item_attendance_overrides_membership_id_meal_date_meal_type_item_id_pk" PRIMARY KEY("membership_id","meal_date","meal_type","item_id")
);

ALTER TABLE "diner_menu_item_absences" ADD CONSTRAINT "diner_menu_item_absences_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE cascade;
ALTER TABLE "diner_menu_item_absences" ADD CONSTRAINT "diner_menu_item_absences_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE cascade;
ALTER TABLE "diner_item_attendance_overrides" ADD CONSTRAINT "diner_item_attendance_overrides_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE cascade;
CREATE INDEX "diner_item_attendance_date_meal_idx" ON "diner_item_attendance_overrides" USING btree ("meal_date","meal_type");
