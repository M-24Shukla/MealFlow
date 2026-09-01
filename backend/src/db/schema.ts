import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const membershipStatus = pgEnum("membership_status", [
  "ACTIVE",
  "REMOVED",
]);
export const membershipRole = pgEnum("membership_role", [
  "ADMIN",
  "CONSUMER",
  "PRODUCER",
]);
export const joinRequestStatus = pgEnum("join_request_status", [
  "PENDING",
  "APPROVED",
  "REJECTED",
]);
export const mealType = pgEnum("meal_type", [
  "BREAKFAST",
  "BRUNCH",
  "LUNCH",
  "SNACKS",
  "DINNER",
]);
export const foodCategory = pgEnum("food_category", [
  "VEG",
  "NON_VEG",
  "EGG",
  "VEGAN",
]);
export const attendanceStatus = pgEnum("attendance_status", [
  "PRESENT",
  "ABSENT",
]);
export const preparationStatus = pgEnum("preparation_status", [
  "UNPREPARED",
  "IN_PROGRESS",
  "PREPARED",
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("sessions_token_hash_unique").on(table.tokenHash),
    index("sessions_user_id_idx").on(table.userId),
  ],
);

export const groups = pgTable(
  "groups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    timezone: text("timezone").notNull(),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => users.id),
    isJoinable: boolean("is_joinable").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [uniqueIndex("groups_slug_unique").on(table.slug)],
);

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: membershipStatus("status").default("ACTIVE").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("memberships_group_user_unique").on(
      table.groupId,
      table.userId,
    ),
    index("memberships_group_status_idx").on(table.groupId, table.status),
  ],
);

export const membershipRoles = pgTable(
  "membership_roles",
  {
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    role: membershipRole("role").notNull(),
  },
  (table) => [primaryKey({ columns: [table.membershipId, table.role] })],
);

export const joinRequests = pgTable(
  "join_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    applicantId: uuid("applicant_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    requestedRole: membershipRole("requested_role").notNull(),
    status: joinRequestStatus("status").default("PENDING").notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("join_requests_group_status_idx").on(table.groupId, table.status),
    uniqueIndex("join_requests_pending_unique").on(
      table.groupId,
      table.applicantId,
      table.status,
    ),
  ],
);

export const mealSchedules = pgTable(
  "meal_schedules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    weekday: integer("weekday").notNull(),
    mealType: mealType("meal_type").notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("meal_schedules_group_weekday_meal_unique").on(
      table.groupId,
      table.weekday,
      table.mealType,
    ),
    index("meal_schedules_group_weekday_enabled_idx").on(
      table.groupId,
      table.weekday,
      table.enabled,
    ),
    check(
      "meal_schedules_weekday_check",
      sql`${table.weekday} between 1 and 7`,
    ),
    check(
      "meal_schedules_time_window_check",
      sql`${table.startTime} < ${table.endTime}`,
    ),
  ],
);

export const weeklyMenus = pgTable(
  "weekly_menus",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    weekday: integer("weekday").notNull(),
    mealType: mealType("meal_type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("weekly_menus_group_weekday_meal_unique").on(
      table.groupId,
      table.weekday,
      table.mealType,
    ),
    check("weekly_menus_weekday_check", sql`${table.weekday} between 1 and 7`),
  ],
);

export const menuItems = pgTable(
  "menu_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    menuId: uuid("menu_id")
      .notNull()
      .references(() => weeklyMenus.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: foodCategory("category").notNull(),
    recipeUrl: text("recipe_url"),
    notes: text("notes"),
    sortOrder: integer("sort_order").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("menu_items_menu_sort_order_unique").on(
      table.menuId,
      table.sortOrder,
    ),
    index("menu_items_menu_order_idx").on(table.menuId, table.sortOrder),
  ],
);

export const recurringAbsences = pgTable(
  "recurring_absences",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    weekday: integer("weekday").notNull(),
    mealType: mealType("meal_type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("recurring_absences_membership_weekday_meal_unique").on(
      table.membershipId,
      table.weekday,
      table.mealType,
    ),
    check(
      "recurring_absences_weekday_check",
      sql`${table.weekday} between 1 and 7`,
    ),
  ],
);

export const attendanceOverrides = pgTable(
  "attendance_overrides",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    mealDate: date("meal_date").notNull(),
    mealType: mealType("meal_type").notNull(),
    attendance: attendanceStatus("attendance").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("attendance_overrides_membership_date_meal_unique").on(
      table.membershipId,
      table.mealDate,
      table.mealType,
    ),
    index("attendance_overrides_date_meal_membership_idx").on(
      table.mealDate,
      table.mealType,
      table.membershipId,
    ),
  ],
);

export const vacations = pgTable(
  "vacations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    startDate: date("start_date").notNull(),
    startMeal: mealType("start_meal").notNull(),
    endDate: date("end_date").notNull(),
    endMeal: mealType("end_meal").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("vacations_membership_start_date_idx").on(
      table.membershipId,
      table.startDate,
    ),
    check(
      "vacations_date_range_check",
      sql`${table.startDate} < ${table.endDate} OR (${table.startDate} = ${table.endDate} AND ${table.startMeal} <= ${table.endMeal})`,
    ),
  ],
);

export const producerOffDays = pgTable(
  "producer_off_days",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    weekday: integer("weekday").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("producer_off_days_membership_weekday_unique").on(
      table.membershipId,
      table.weekday,
    ),
    check(
      "producer_off_days_weekday_check",
      sql`${table.weekday} between 1 and 7`,
    ),
  ],
);

export const producerLeaves = pgTable(
  "producer_leaves",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    mealDate: date("meal_date").notNull(),
    mealType: mealType("meal_type"),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("producer_leaves_membership_date_idx").on(
      table.membershipId,
      table.mealDate,
    ),
  ],
);

export const mealOccurrences = pgTable(
  "meal_occurrences",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    mealDate: date("meal_date").notNull(),
    mealType: mealType("meal_type").notNull(),
    weeklyMenuId: uuid("weekly_menu_id").references(() => weeklyMenus.id, {
      onDelete: "set null",
    }),
    materializedAt: timestamp("materialized_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("meal_occurrences_group_date_meal_unique").on(
      table.groupId,
      table.mealDate,
      table.mealType,
    ),
    index("meal_occurrences_group_date_idx").on(table.groupId, table.mealDate),
  ],
);

export const mealOccurrenceItems = pgTable(
  "meal_occurrence_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    occurrenceId: uuid("occurrence_id")
      .notNull()
      .references(() => mealOccurrences.id, { onDelete: "cascade" }),
    sourceMenuItemId: uuid("source_menu_item_id").references(
      () => menuItems.id,
      {
        onDelete: "set null",
      },
    ),
    name: text("name").notNull(),
    category: foodCategory("category").notNull(),
    recipeUrl: text("recipe_url"),
    sortOrder: integer("sort_order").notNull(),
  },
  (table) => [
    uniqueIndex("meal_occurrence_items_occurrence_sort_order_unique").on(
      table.occurrenceId,
      table.sortOrder,
    ),
  ],
);

export const occurrenceProducers = pgTable(
  "occurrence_producers",
  {
    occurrenceId: uuid("occurrence_id")
      .notNull()
      .references(() => mealOccurrences.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    assignedAt: timestamp("assigned_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.occurrenceId, table.membershipId] }),
  ],
);

export const preparationRecords = pgTable(
  "preparation_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    occurrenceItemId: uuid("occurrence_item_id")
      .notNull()
      .references(() => mealOccurrenceItems.id, { onDelete: "cascade" }),
    status: preparationStatus("status").default("UNPREPARED").notNull(),
    updatedByMembershipId: uuid("updated_by_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("preparation_records_occurrence_item_unique").on(
      table.occurrenceItemId,
    ),
    index("preparation_records_status_idx").on(table.status),
  ],
);

export const actionItems = pgTable(
  "action_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    occurrenceId: uuid("occurrence_id")
      .notNull()
      .references(() => mealOccurrences.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    completed: boolean("completed").default(false).notNull(),
    createdByMembershipId: uuid("created_by_membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    completedByMembershipId: uuid("completed_by_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("action_items_occurrence_completed_idx").on(
      table.occurrenceId,
      table.completed,
    ),
  ],
);

export const feedback = pgTable(
  "feedback",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    occurrenceId: uuid("occurrence_id")
      .notNull()
      .references(() => mealOccurrences.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    occurrenceItemId: uuid("occurrence_item_id").references(
      () => mealOccurrenceItems.id,
      { onDelete: "cascade" },
    ),
    rating: integer("rating").notNull(),
    comment: text("comment").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("feedback_occurrence_item_membership_unique").on(
      table.occurrenceId,
      table.occurrenceItemId,
      table.membershipId,
    ),
    index("feedback_occurrence_created_at_idx").on(
      table.occurrenceId,
      table.createdAt,
    ),
    check("feedback_rating_check", sql`${table.rating} between 1 and 5`),
    check(
      "feedback_comment_length_check",
      sql`char_length(${table.comment}) between 1 and 1000`,
    ),
  ],
);
