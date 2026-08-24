# MealFlow — Weekly Menu & Meal Management

## Recommended build

MealFlow is a multi-tenant web app for shared kitchens and mess groups. It lets a group publish weekly meal schedules and menus, shows the currently active meal and recipe links, calculates diners after attendance overrides, and gives producers a preparation workflow.

### Stack

| Layer | Choice | Reason |
|---|---|---|
| Web UI | React + TypeScript + Vite | Fast, accessible responsive dashboard with a small client bundle. |
| API | Cloudflare Workers + Hono | Typed HTTP API, low operational overhead, and edge deployment. |
| Data | Cloudflare D1 (SQLite) | Relational data and transactional writes for groups, menus, membership, attendance, and preparation. |
| Data access | Drizzle ORM + raw prepared statements for critical queries | Typed schema/migrations; no interpolated SQL. |
| Authentication | OpenAI Sites SIWC for an internal workspace deployment | No passwords to store; identity is verified at the server boundary. |
| File/audio storage | Cloudflare R2, phase 2 only | Required only when ingredient audio recordings are retained. |
| Observability | Workers Analytics + Sentry | Request errors, performance, and release attribution. |
| CI/CD | GitHub Actions + Cloudflare deployment | Migration gate, tests, and controlled promotion. |

## Product scope: MVP

1. Sign in and create/join a group by an invite token (not a raw UUID).
2. Set per-day meal windows and weekly menus with multiple food items and recipe links.
3. Resolve the active meal using the group's IANA timezone and return its recipe links.
4. Record recurring attendance rules and dated `PRESENT`/`ABSENT` overrides.
5. Show expected headcount to producers, incorporating attendance and membership.
6. Let assigned producers record recurring off-days/leaves and update per-item preparation status.
7. Let only consumer members submit one 1–5 rating and comment per meal occurrence.

Speech-to-text ingredient capture, push notifications, grocery fulfillment, payments, nutrition/allergens, and recipe content scraping are intentionally outside the MVP.

## Local configuration

Copy `.env.example` to `.env`. Do not commit `.env`.

```bash
npm install
npm run db:migrate:local
npm run dev
npm test
npm run build
```

## Required deployment configuration

- Set the application timezone per group (for example `Asia/Kolkata`); never infer it from a browser.
- Bind a production D1 database as `DB`.
- Turn on SIWC / workspace sign-in and restrict the deployment to the intended workspace or an explicit allow-list.
- Configure `APP_ORIGIN`, `SENTRY_DSN`, and `LOG_LEVEL` as runtime secrets/variables.
- Apply migrations before each release; back up/export D1 before destructive migrations.
- Enforce HTTPS, a CSP, rate limits on write endpoints, and server-side membership/role checks.

See `docs/api-contract.md`, `docs/architecture.md`, and `db/0001_initial.sql` for the implementation contract.
