# Architecture

MealFlow uses a React/Vite frontend and a Node.js/Hono API deployed as separate Render services, with Supabase PostgreSQL as the authoritative relational database. The deployment topology is defined in [`render.yaml`](../render.yaml).

## Boundaries

- `frontend/` owns browser UI and only uses the versioned REST API.
- `backend/` owns HTTP routes, validation, sessions, authorization, Drizzle schema, and generated PostgreSQL migrations.
- PostgreSQL owns persistent state; no browser storage is used as the source of truth.
- `openspec/changes/implement-weekly-menu-management/` is the implementation contract and task sequence.

## Identity and membership

People register with an email/password account and receive a secure HTTP-only session. The server stores only an HMAC-protected session-token hash. A group has an immutable creator. The creator receives `ADMIN` and `CONSUMER` roles, and only that creator can approve join requests or change administrator roles.

## Configuration

The backend validates `DATABASE_URL`, `ALLOWED_CORS_ORIGINS`, `SESSION_SECRET`, and session settings at startup. Local, preview, and production examples live beside each service under `frontend/` and `backend/`. Supabase supplies the PostgreSQL connection string; Render stores it as an API service secret.

## Deferred implementation

The next approved sections add menu scheduling, attendance/feedback, producer preparation, UI workflows, and release verification. Do not reintroduce the former Cloudflare D1 model; it was superseded by the selected Render/PostgreSQL design.
