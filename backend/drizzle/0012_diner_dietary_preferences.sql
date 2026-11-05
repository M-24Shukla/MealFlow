CREATE TABLE "diner_dietary_preferences" (
	"membership_id" uuid NOT NULL,
	"category" "food_category" NOT NULL,
	CONSTRAINT "diner_dietary_preferences_membership_id_category_pk" PRIMARY KEY("membership_id","category")
);

ALTER TABLE "diner_dietary_preferences" ADD CONSTRAINT "diner_dietary_preferences_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE cascade;
