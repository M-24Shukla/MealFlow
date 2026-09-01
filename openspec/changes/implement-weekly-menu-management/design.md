## Context

The repository currently contains early domain/API material oriented around Cloudflare D1. The selected target is now Render. This change introduces a multi-route application with durable relational data and identity-aware writes; see `proposal.md` for the product motivation and the capability specs for observable behavior.

## Goals / Non-Goals

**Goals:**

- Ship a conventional, portable TypeScript application on Render.
- Keep UI, HTTP routing, domain rules, and data access independently testable.
- Ensure menu activation and attendance are evaluated in the group's timezone.
- Keep the first deployment small: one static frontend, one API service, and one PostgreSQL database.

**Non-Goals:**

- Speech-to-text, raw-audio retention, inventory, shopping fulfillment, payments, notifications, and native apps.
- Automatic recipe redirection when a meal has multiple food items.
- Multi-region writes, offline synchronization, and event-driven background processing.

## Decisions

### Render service topology

Deploy a React/Vite static site and a Node.js web service in Render's Singapore region, with Supabase PostgreSQL as the authoritative database. The static site calls the API through a configured API origin. The API exposes a health endpoint and runs database migrations before release.

Render is chosen over Workers/D1 because the product has conventional relational workflows and benefits from PostgreSQL, an always-on Node process, and straightforward operational debugging. A single full-stack server was considered, but separate static and API services keep browser assets independently cacheable and keep deployment concerns clear.

### TypeScript and Hono API

Use TypeScript and Hono for the API. Route handlers accept/return standard Fetch API types, while services own domain rules and repositories own database queries. Hono supports the present Node runtime and a future Workers runtime, preserving an exit path from Render.

Use a small route/service/repository separation; do not introduce CQRS, a message bus, or generic repository interfaces.

### PostgreSQL and Drizzle migrations

Use Supabase PostgreSQL with Drizzle schema definitions and committed generated migrations. The existing D1-oriented SQL migration is reference material and SHALL be replaced with PostgreSQL-compatible migrations before implementation begins.

Use UUID primary keys, timestamp-with-time-zone audit fields, check constraints/enums for statuses, foreign keys, and indexes that support group/date/meal queries. Model group roles in a membership-role table so the creator can be both administrator and consumer. Store the immutable creator user ID on the group, record pending join requests separately, and enforce that only the creator can approve requests or mutate administrator roles. Store group timezone as an IANA identifier. Keep UTC instants in the database and derive local dates/times only with the group's timezone.

### Operational model

Menus remain weekly templates. The API creates a `meal_occurrence` lazily when feedback or preparation begins, preserving history independently from later template changes. Expected headcount starts with active consumers, removes recurring absences, then applies dated overrides. A dated override is authoritative.

The API validates that configured meal windows do not overlap for a group and weekday. The UI presents all matching meal items; it does not auto-navigate to an arbitrary recipe.

### Authorization and secrets

Authentication and authorization occur at the API boundary. The browser never sends an authoritative user ID or role. A middleware resolves the authenticated user, then group services check the relevant active membership role for every group-scoped operation. Any authenticated person can request entry from a group landing page, but only the recorded creator can approve a request and assign consumer or producer access.

Use application-managed email/password authentication with secure, HTTP-only sessions so invited external residents can sign in without a workspace account. Password hashes and sessions are stored in PostgreSQL; secrets stay in Render environment groups or service secrets, never in the client bundle or repository. Email verification and account-recovery flows are deferred from the MVP.

### API and quality controls

Expose the versioned REST API already described in `docs/api-contract.md`, revising it only where the specs require. Validate request bodies at the route boundary; return a stable JSON error envelope; apply request IDs, structured logs, rate limits on authentication/invite/write endpoints, and a restrictive CORS allow-list.

Use unit tests for domain rules, integration tests for routes and PostgreSQL repository behavior, and a small end-to-end smoke test for the core schedule-to-preparation workflow.

## Risks / Trade-offs

- [Application-managed authentication increases security responsibility] → Use a mature password-hashing implementation, secure session cookies, rate limits, and authentication integration tests.
- [Timezone edge cases can yield unexpected dates] → Use a tested timezone library and store each group timezone explicitly; test DST and midnight boundaries.
- [Concurrent attendance/preparation writes can overwrite data] → Use unique constraints and transactional upserts; return conflicts where a revision cannot be safely applied.
- [Template edits could alter historical perception] → Materialize meal occurrences and snapshot relevant menu item data when preparation or feedback begins.
- [Singapore-origin API adds latency for non-Asian users] → Start colocated for transactional consistency; use CDN caching only for public/static content if demand proves it necessary.

## Migration Plan

1. Create a Render Blueprint for the static site and API service, and configure a Supabase PostgreSQL project plus separate preview and production environments.
2. Add PostgreSQL schema, generated migrations, and a migration command that runs before API release.
3. Deploy the API with a health check and no production traffic; verify database connectivity and migration status.
4. Deploy the static site with its production API origin; run authenticated smoke tests for group, active meal, attendance, and preparation flows.
5. Promote after tests pass. Roll back application code through Render; use forward-only corrective migrations rather than reverting a migration that may contain user data.
