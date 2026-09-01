# MealFlow — Weekly Menu & Meal Management

## Recommended build

MealFlow is a multi-tenant web app for shared kitchens and mess groups. It lets a group publish weekly meal schedules and menus, shows the currently active meal and recipe links, calculates diners after attendance overrides, and gives producers a preparation workflow.

### Stack

| Layer | Choice | Reason |
|---|---|---|
| Web UI | React + TypeScript + Vite | Fast, accessible responsive dashboard with a small client bundle. |
| API | Node.js + Hono | Typed REST API running as a Render web service. |
| Data | Supabase PostgreSQL | Relational storage and transactional writes for groups, memberships, and meal operations. |
| Data access | Drizzle ORM | Typed PostgreSQL schema and generated migrations. |
| Authentication | Email/password + HTTP-only sessions | Supports invited external residents without a workspace account. |
| Observability | Render logs + Sentry | Request errors, performance, and release attribution. |
| CI/CD | Render Blueprint | Repeatable static-site, API, and PostgreSQL deployment. |

## Product scope: MVP

1. Sign in, create a group, or request to join one from its landing page; the creator approves consumer/cook roles.
2. Set per-day meal windows and weekly menus with multiple food items and recipe links.
3. Resolve the active meal using the group's IANA timezone and return its recipe links.
4. Record recurring attendance rules and dated `PRESENT`/`ABSENT` overrides.
5. Show expected headcount to producers, incorporating attendance and membership.
6. Let assigned producers record recurring off-days/leaves and update per-item preparation status.
7. Let only consumer members submit one 1–5 rating and comment per meal occurrence.

Speech-to-text ingredient capture, push notifications, grocery fulfillment, payments, nutrition/allergens, and recipe content scraping are intentionally outside the MVP.

## Local configuration

Copy `backend/.env.example` to `backend/.env`, replace `[DATABASE_PASSWORD]` with the Supabase database password, and copy `frontend/.env.example` to `frontend/.env`. Do not commit either file. Download the Supabase server root certificate from **Database → Settings → SSL Configuration** to `backend/prod-supabase.cer`. The backend loads this certificate automatically for verified SSL connections.

```bash
cd backend && npm install && npm run db:generate && npm run dev
cd frontend && npm install && npm run dev
```

Run the committed schema migrations against Supabase before starting the API for the first time:

```bash
cd backend && npm run db:migrate
```

The integration suite writes isolated test records to the configured database and removes them afterward. Run it only against a dedicated Supabase test project:

```bash
cd backend && npm run test:integration
```

Run the release smoke suite against the configured Supabase project after applying migrations:

```bash
cd backend && npm run test:smoke
```

## Required deployment configuration

- Set the application timezone per group (for example `Asia/Kolkata`); never infer it from a browser.
- In Render, set `DATABASE_URL` as a secret using Supabase's Session pooler connection string. Commit the public Supabase server root certificate at `backend/prod-supabase.cer`; the backend uses it for certificate verification.
- Configure `ALLOWED_CORS_ORIGINS`, `SESSION_TTL_DAYS`, and any monitoring secrets as Render environment variables. Sessions default to a rolling 365-day lifetime; set `SESSION_TTL_DAYS` to a shorter value if required by your security policy.
- Apply Drizzle migrations before each release; use forward-only corrective migrations in production.
- Enforce HTTPS, a CSP, rate limits on write endpoints, and server-side membership/role checks.

See `openspec/changes/implement-weekly-menu-management/` for the implementation contract and `render.yaml` for deployment configuration.
