CREATE TYPE "public"."attendance_status" AS ENUM('PRESENT', 'ABSENT');--> statement-breakpoint
CREATE TYPE "public"."food_category" AS ENUM('VEG', 'NON_VEG', 'EGG', 'VEGAN');--> statement-breakpoint
CREATE TYPE "public"."meal_type" AS ENUM('BREAKFAST', 'BRUNCH', 'LUNCH', 'SNACKS', 'DINNER');--> statement-breakpoint
CREATE TYPE "public"."preparation_status" AS ENUM('UNPREPARED', 'IN_PROGRESS', 'PREPARED');--> statement-breakpoint
CREATE TABLE "attendance_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"membership_id" uuid NOT NULL,
	"meal_date" date NOT NULL,
	"meal_type" "meal_type" NOT NULL,
	"attendance" "attendance_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurrence_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"comment" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_rating_check" CHECK ("feedback"."rating" between 1 and 5),
	CONSTRAINT "feedback_comment_length_check" CHECK (char_length("feedback"."comment") between 1 and 1000)
);
--> statement-breakpoint
CREATE TABLE "meal_occurrence_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurrence_id" uuid NOT NULL,
	"source_menu_item_id" uuid,
	"name" text NOT NULL,
	"category" "food_category" NOT NULL,
	"recipe_url" text,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meal_occurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"meal_date" date NOT NULL,
	"meal_type" "meal_type" NOT NULL,
	"weekly_menu_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meal_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"meal_type" "meal_type" NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meal_schedules_weekday_check" CHECK ("meal_schedules"."weekday" between 1 and 7),
	CONSTRAINT "meal_schedules_time_window_check" CHECK ("meal_schedules"."start_time" < "meal_schedules"."end_time")
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"menu_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" "food_category" NOT NULL,
	"recipe_url" text,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "occurrence_producers" (
	"occurrence_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "occurrence_producers_occurrence_id_membership_id_pk" PRIMARY KEY("occurrence_id","membership_id")
);
--> statement-breakpoint
CREATE TABLE "preparation_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurrence_item_id" uuid NOT NULL,
	"status" "preparation_status" DEFAULT 'UNPREPARED' NOT NULL,
	"updated_by_membership_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "producer_leaves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"membership_id" uuid NOT NULL,
	"meal_date" date NOT NULL,
	"meal_type" "meal_type",
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "producer_off_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"membership_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "producer_off_days_weekday_check" CHECK ("producer_off_days"."weekday" between 1 and 7)
);
--> statement-breakpoint
CREATE TABLE "recurring_absences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"membership_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"meal_type" "meal_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_absences_weekday_check" CHECK ("recurring_absences"."weekday" between 1 and 7)
);
--> statement-breakpoint
CREATE TABLE "weekly_menus" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"meal_type" "meal_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_menus_weekday_check" CHECK ("weekly_menus"."weekday" between 1 and 7)
);
--> statement-breakpoint
ALTER TABLE "attendance_overrides" ADD CONSTRAINT "attendance_overrides_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_occurrence_id_meal_occurrences_id_fk" FOREIGN KEY ("occurrence_id") REFERENCES "public"."meal_occurrences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_occurrence_items" ADD CONSTRAINT "meal_occurrence_items_occurrence_id_meal_occurrences_id_fk" FOREIGN KEY ("occurrence_id") REFERENCES "public"."meal_occurrences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_occurrence_items" ADD CONSTRAINT "meal_occurrence_items_source_menu_item_id_menu_items_id_fk" FOREIGN KEY ("source_menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_occurrences" ADD CONSTRAINT "meal_occurrences_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_occurrences" ADD CONSTRAINT "meal_occurrences_weekly_menu_id_weekly_menus_id_fk" FOREIGN KEY ("weekly_menu_id") REFERENCES "public"."weekly_menus"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_schedules" ADD CONSTRAINT "meal_schedules_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_menu_id_weekly_menus_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."weekly_menus"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occurrence_producers" ADD CONSTRAINT "occurrence_producers_occurrence_id_meal_occurrences_id_fk" FOREIGN KEY ("occurrence_id") REFERENCES "public"."meal_occurrences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occurrence_producers" ADD CONSTRAINT "occurrence_producers_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preparation_records" ADD CONSTRAINT "preparation_records_occurrence_item_id_meal_occurrence_items_id_fk" FOREIGN KEY ("occurrence_item_id") REFERENCES "public"."meal_occurrence_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preparation_records" ADD CONSTRAINT "preparation_records_updated_by_membership_id_memberships_id_fk" FOREIGN KEY ("updated_by_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "producer_leaves" ADD CONSTRAINT "producer_leaves_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "producer_off_days" ADD CONSTRAINT "producer_off_days_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_absences" ADD CONSTRAINT "recurring_absences_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_menus" ADD CONSTRAINT "weekly_menus_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_overrides_membership_date_meal_unique" ON "attendance_overrides" USING btree ("membership_id","meal_date","meal_type");--> statement-breakpoint
CREATE INDEX "attendance_overrides_date_meal_membership_idx" ON "attendance_overrides" USING btree ("meal_date","meal_type","membership_id");--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_occurrence_membership_unique" ON "feedback" USING btree ("occurrence_id","membership_id");--> statement-breakpoint
CREATE INDEX "feedback_occurrence_created_at_idx" ON "feedback" USING btree ("occurrence_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "meal_occurrence_items_occurrence_sort_order_unique" ON "meal_occurrence_items" USING btree ("occurrence_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "meal_occurrences_group_date_meal_unique" ON "meal_occurrences" USING btree ("group_id","meal_date","meal_type");--> statement-breakpoint
CREATE INDEX "meal_occurrences_group_date_idx" ON "meal_occurrences" USING btree ("group_id","meal_date");--> statement-breakpoint
CREATE UNIQUE INDEX "meal_schedules_group_weekday_meal_unique" ON "meal_schedules" USING btree ("group_id","weekday","meal_type");--> statement-breakpoint
CREATE INDEX "meal_schedules_group_weekday_enabled_idx" ON "meal_schedules" USING btree ("group_id","weekday","enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "menu_items_menu_sort_order_unique" ON "menu_items" USING btree ("menu_id","sort_order");--> statement-breakpoint
CREATE INDEX "menu_items_menu_order_idx" ON "menu_items" USING btree ("menu_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "preparation_records_occurrence_item_unique" ON "preparation_records" USING btree ("occurrence_item_id");--> statement-breakpoint
CREATE INDEX "preparation_records_status_idx" ON "preparation_records" USING btree ("status");--> statement-breakpoint
CREATE INDEX "producer_leaves_membership_date_idx" ON "producer_leaves" USING btree ("membership_id","meal_date");--> statement-breakpoint
CREATE UNIQUE INDEX "producer_off_days_membership_weekday_unique" ON "producer_off_days" USING btree ("membership_id","weekday");--> statement-breakpoint
CREATE UNIQUE INDEX "recurring_absences_membership_weekday_meal_unique" ON "recurring_absences" USING btree ("membership_id","weekday","meal_type");--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_menus_group_weekday_meal_unique" ON "weekly_menus" USING btree ("group_id","weekday","meal_type");