## 1. Project foundation

- [x] 1.1 Create the React/Vite frontend and TypeScript/Hono API project structure with shared linting, formatting, and test commands.
- [x] 1.2 Add Render Blueprint configuration for a static frontend, Node.js API service, and colocated PostgreSQL database with health checks and environment-variable declarations.
- [x] 1.3 Add validated environment configuration for local, preview, and production API origins, database access, session secrets, and allowed CORS origins.
- [x] 1.4 Replace the D1-oriented schema/API implementation notes with the selected PostgreSQL and creator-controlled membership model.

## 2. Persistence and authentication

- [x] 2.1 Define the Drizzle PostgreSQL schema and generated migrations for users, password credentials, sessions, groups, roles, join requests, schedules, menus, attendance, leaves, meal occurrences, preparation, and feedback.
- [x] 2.2 Add indexes, uniqueness constraints, and transactional upsert behavior for group/date/meal and membership-role queries; verify migrations apply to a clean local PostgreSQL database.
- [x] 2.3 Implement email/password registration, login, logout, secure HTTP-only sessions, password hashing, and rate limits for authentication endpoints.
- [x] 2.4 Implement API authentication middleware and group authorization helpers that derive identity and roles only from the server-side session.

## 3. Group membership and roles

- [x] 3.1 Implement group creation with immutable creator identity and automatic administrator-plus-consumer roles.
- [x] 3.2 Implement public group landing-page lookup and authenticated consumer/producer join-request submission.
- [x] 3.3 Implement creator-only join-request approval/rejection and role assignment.
- [x] 3.4 Implement creator-only consumer promotion/demotion rules, including protection of the creator and rejection of producer-to-admin promotion.
- [x] 3.5 Add route and integration tests for unauthorized access, creator protections, role transitions, and pending join requests.

## 4. Menus and active meal

- [x] 4.1 Implement administrator-only schedule create/read/update with weekday, meal type, time-window validation, and overlap rejection.
- [x] 4.2 Implement administrator-only weekly menu and ordered food-item management with food category and recipe-link validation.
- [x] 4.3 Implement group-timezone active-meal resolution and explicit no-active-meal responses.
- [x] 4.4 Add unit and route tests for timezone boundaries, overlapping schedules, multiple food items, and active-meal responses.

## 5. Consumer attendance and feedback

- [x] 5.1 Implement consumer-owned recurring absence rule and dated present/absent override endpoints.
- [x] 5.2 Implement expected-headcount calculation with dated overrides taking precedence over recurring absences.
- [x] 5.3 Implement consumer-only, one-per-occurrence feedback creation and retrieval with rating/comment validation.
- [x] 5.4 Add tests for attendance precedence, headcount authorization, duplicate feedback, and producer feedback denial.

## 6. Producer preparation operations

- [x] 6.1 Implement producer recurring off-days and immediate dated leave recording without an approval state.
- [x] 6.2 Materialize meal occurrences and item preparation records without mutating historical operation data after later menu-template edits.
- [x] 6.3 Implement authorized preparation-board retrieval with expected headcount and item status updates.
- [x] 6.4 Add tests for leave availability, preparation authorization, state transitions, and item-status audit attribution.

## 7. User interface

- [x] 7.1 Build authenticated registration/login and the public group landing page with consumer/cook join-request forms and pending state.
- [x] 7.2 Build creator screens for join requests and role management, including immutable-creator safeguards.
- [x] 7.3 Build administrator schedule/menu configuration and active-meal views with user-selected recipe links.
- [x] 7.4 Build consumer attendance/feedback screens and producer availability/preparation dashboard screens.
- [x] 7.5 Add responsive, keyboard-accessible form controls, validation errors, loading states, and empty states for each primary workflow.

## 8. Verification and release

- [ ] 8.1 Add API contract tests for all documented group, menu, attendance, feedback, leave, and preparation endpoints.
- [x] 8.2 Add an end-to-end smoke test covering registration, group creation, join approval, menu activation, attendance, and preparation update.
- [ ] 8.3 Run lint, type checks, unit/integration tests, production builds, and a local PostgreSQL migration verification.
- [ ] 8.4 Deploy to a Render preview environment, run the smoke test against it, and promote the validated configuration to production.
