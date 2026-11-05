# CookDuKoo — Weekly Menu & Meal Management

## Recommended build

CookDuKoo is a multi-tenant web app for shared kitchens and mess groups. It lets a group publish weekly meal schedules and menus, shows the currently active meal and recipe links, calculates diners after attendance overrides, and gives producers a preparation workflow.

### Stack

| Layer | Choice | Reason |
|---|---|---|
| Web UI | React + TypeScript + Vite | Fast, accessible responsive dashboard with a small client bundle. |
| API | Node.js + Hono on Netlify Functions | Typed REST API deployed with the frontend on one origin. |
| Data | Supabase PostgreSQL | Relational storage and transactional writes for groups, memberships, and meal operations. |
| Data access | Drizzle ORM | Typed PostgreSQL schema and generated migrations. |
| Authentication | Email/password + HTTP-only sessions | Supports invited external residents without a workspace account. |
| Observability | Netlify function logs | Structured API failure logs. |
| CI/CD | Netlify | Builds the React site and bundles the Hono API as a Node function. |

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

Copy `backend/.env.example` to `backend/.env`, copy the full pooler connection string from Supabase **Connect**, replace its password placeholder, and copy `frontend/.env.example` to `frontend/.env`. Do not commit either file. Download the Supabase server root certificate from **Database → Settings → SSL Configuration** to `backend/prod-supabase.cer`. The backend loads this certificate automatically for verified SSL connections. Local development can use the Session pooler; Netlify should use the Transaction pooler.

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

## Deploy frontend and API to Netlify

1. Import this repository into Netlify. Use the repository root as the base directory, and clear any old `frontend` package-directory setting. The committed `netlify.toml` installs both packages, builds them, publishes `frontend/dist`, and bundles `backend/functions/api.mts`.
2. Set these environment variables in Netlify with the **Functions** scope (or all scopes):

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Full **Transaction pooler** URI copied from Supabase **Connect**, normally port `6543`; replace only the password placeholder. |
   | `SESSION_SECRET` | A stable, random secret of at least 32 characters; generate with `openssl rand -hex 32`. |
   | `NODE_ENV` | `production` |
   | `ALLOWED_CORS_ORIGINS` | Your exact site origin, such as `https://your-site.netlify.app`. |
   | `SESSION_TTL_DAYS` | Optional; defaults to `365`. |

   Leave `SESSION_COOKIE_DOMAIN` unset so cookies belong to the current site. Never prefix backend secrets with `VITE_`. The build sets `VITE_API_BASE_URL=/api/v1`; remove any older Netlify override pointing to Render or localhost. Redeploy after changing variables.
3. Apply committed migrations separately against your Supabase project before the first deployment and whenever schema changes. From `backend`, run `npm run db:migrate` with a **Session pooler** connection string in the local environment. Migrations are deliberately excluded from Netlify builds so deploy previews cannot change the production schema.
4. Deploy the site. Verify `/health` returns `{"status":"ok"}`, `/api/v1/auth/me` returns JSON with status `401` while signed out, and registration/login works with a session cookie. `/health` checks the function only; login verifies database access. Frontend routes continue to use the SPA fallback.

The function forwards Web Requests directly to Hono without starting a listening server. The PostgreSQL pool is reused within a warm instance and capped at one connection per instance. Queries use node-postgres without named prepared statements, compatible with Supabase's Transaction pooler. The public CA certificate is included in the function bundle.

Netlify's credit-based Free plan currently includes 300 monthly credits shared by production deploys, requests, bandwidth, and function compute. Sites pause when the allowance is exhausted. Check [current pricing](https://www.netlify.com/pricing/) and your account's plan; legacy accounts may have different limits. Supabase remains a separate service with its own quota. Cold starts and database network latency still affect response times.

The current authentication rate limiter is held in process memory. On Netlify it limits attempts only within each warm instance, so it is not a global brute-force limit. Use platform-level rate limiting or shared storage if a global limit is required.

For a local platform preview, run `npx netlify-cli dev` from the repository root after making the backend variables available to that process. Normal two-process development with `npm run dev` in each package remains available.

## Alternative: Render deployment

- Set the application timezone per group (for example `Asia/Kolkata`); never infer it from a browser.
- In Render, set `DATABASE_URL` as a secret using Supabase's Session pooler connection string. Commit the public Supabase server root certificate at `backend/prod-supabase.cer`; the backend uses it for certificate verification.
- Configure `ALLOWED_CORS_ORIGINS`, `SESSION_TTL_DAYS`, and any monitoring secrets as Render environment variables. Sessions default to a rolling 365-day lifetime; set `SESSION_TTL_DAYS` to a shorter value if required by your security policy.
- Apply Drizzle migrations before each release; use forward-only corrective migrations in production.
- Enforce HTTPS, a CSP, rate limits on write endpoints, and server-side membership/role checks.

See `openspec/changes/implement-weekly-menu-management/` for the implementation contract, `netlify.toml` for Netlify deployment, and `render.yaml` for the alternative Render deployment.
