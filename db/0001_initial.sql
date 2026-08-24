PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(email)
);

CREATE TABLE groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE group_memberships (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('ADMIN','CONSUMER','PRODUCER')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REMOVED')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(group_id, user_id)
);
CREATE INDEX idx_memberships_group_role ON group_memberships(group_id, role, status);

CREATE TABLE group_invites (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('CONSUMER','PRODUCER')),
  expires_at TEXT NOT NULL,
  max_uses INTEGER,
  use_count INTEGER NOT NULL DEFAULT 0,
  revoked_at TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE meal_schedules (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  meal_type TEXT NOT NULL CHECK (meal_type IN ('BREAKFAST','BRUNCH','LUNCH','SNACKS','DINNER')),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  UNIQUE(group_id, weekday, meal_type)
);
CREATE INDEX idx_schedules_group_day ON meal_schedules(group_id, weekday, enabled);

CREATE TABLE weekly_menus (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  meal_type TEXT NOT NULL CHECK (meal_type IN ('BREAKFAST','BRUNCH','LUNCH','SNACKS','DINNER')),
  published_at TEXT,
  UNIQUE(group_id, weekday, meal_type)
);

CREATE TABLE menu_items (
  id TEXT PRIMARY KEY,
  menu_id TEXT NOT NULL REFERENCES weekly_menus(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  recipe_url TEXT,
  category TEXT NOT NULL CHECK (category IN ('VEG','NON_VEG','EGG','VEGAN')),
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_menu_items_menu_order ON menu_items(menu_id, sort_order);

CREATE TABLE recurring_absences (
  id TEXT PRIMARY KEY,
  membership_id TEXT NOT NULL REFERENCES group_memberships(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  meal_type TEXT NOT NULL CHECK (meal_type IN ('BREAKFAST','BRUNCH','LUNCH','SNACKS','DINNER')),
  UNIQUE(membership_id, weekday, meal_type)
);

CREATE TABLE attendance_overrides (
  id TEXT PRIMARY KEY,
  membership_id TEXT NOT NULL REFERENCES group_memberships(id) ON DELETE CASCADE,
  meal_date TEXT NOT NULL,
  meal_type TEXT NOT NULL CHECK (meal_type IN ('BREAKFAST','BRUNCH','LUNCH','SNACKS','DINNER')),
  attendance TEXT NOT NULL CHECK (attendance IN ('PRESENT','ABSENT')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(membership_id, meal_date, meal_type)
);
CREATE INDEX idx_attendance_override_lookup ON attendance_overrides(meal_date, meal_type, membership_id);

CREATE TABLE producer_off_days (
  id TEXT PRIMARY KEY,
  membership_id TEXT NOT NULL REFERENCES group_memberships(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  UNIQUE(membership_id, weekday)
);

CREATE TABLE producer_leaves (
  id TEXT PRIMARY KEY,
  membership_id TEXT NOT NULL REFERENCES group_memberships(id) ON DELETE CASCADE,
  meal_date TEXT NOT NULL,
  meal_type TEXT CHECK (meal_type IN ('BREAKFAST','BRUNCH','LUNCH','SNACKS','DINNER')),
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  UNIQUE(membership_id, meal_date, meal_type)
);

CREATE TABLE meal_occurrences (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  meal_date TEXT NOT NULL,
  meal_type TEXT NOT NULL CHECK (meal_type IN ('BREAKFAST','BRUNCH','LUNCH','SNACKS','DINNER')),
  menu_id TEXT REFERENCES weekly_menus(id) ON DELETE SET NULL,
  UNIQUE(group_id, meal_date, meal_type)
);

CREATE TABLE occurrence_producers (
  occurrence_id TEXT NOT NULL REFERENCES meal_occurrences(id) ON DELETE CASCADE,
  membership_id TEXT NOT NULL REFERENCES group_memberships(id) ON DELETE CASCADE,
  assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (occurrence_id, membership_id)
);

CREATE TABLE preparation_logs (
  id TEXT PRIMARY KEY,
  occurrence_id TEXT NOT NULL REFERENCES meal_occurrences(id) ON DELETE CASCADE,
  menu_item_id TEXT NOT NULL REFERENCES menu_items(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'UNPREPARED' CHECK (status IN ('UNPREPARED','IN_PROGRESS','PREPARED')),
  prepared_by_membership_id TEXT REFERENCES group_memberships(id),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(occurrence_id, menu_item_id)
);
CREATE INDEX idx_prep_occurrence_status ON preparation_logs(occurrence_id, status);

CREATE TABLE feedback (
  id TEXT PRIMARY KEY,
  occurrence_id TEXT NOT NULL REFERENCES meal_occurrences(id) ON DELETE CASCADE,
  membership_id TEXT NOT NULL REFERENCES group_memberships(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL CHECK (length(comment) BETWEEN 1 AND 1000),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(occurrence_id, membership_id)
);
CREATE INDEX idx_feedback_occurrence ON feedback(occurrence_id, created_at);

PRAGMA optimize;
