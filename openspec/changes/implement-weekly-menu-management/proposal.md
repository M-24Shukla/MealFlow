## Why

Shared living groups need one reliable place to publish the current meal, account for attendance, and coordinate kitchen preparation. Today those decisions are informal and cannot reliably determine the active menu, expected diners, or item readiness.

## What Changes

- Deliver a responsive web application for weekly group menus and active-meal recipe links.
- Add shareable group landing pages, join requests, creator approval, and per-group roles.
- Add configurable weekly meal schedules, menus, and multiple food items per meal.
- Add recurring and date-specific consumer attendance, with consumer-only meal feedback.
- Add producer off-days/leaves and an item-level preparation dashboard.
- Deploy the application on Render using a React frontend, Node.js/Hono API, and managed PostgreSQL.
- Defer speech-to-text ingredient reporting, inventory, notifications, and payments from the MVP.

## Capabilities

### New Capabilities

- `identity-and-group-membership`: Authenticated users create groups, request to join through group landing pages, and receive creator-approved role-scoped access.
- `meal-scheduling-and-active-menu`: Administrators configure schedules and menus; members can view the currently active meal and recipe links in the group timezone.
- `consumer-attendance-and-feedback`: Consumers manage recurring/date-specific attendance and submit authorized meal feedback.
- `producer-preparation-operations`: Producers manage availability and item preparation while viewing expected headcount.

### Modified Capabilities

- None.

## Impact

- New React client, TypeScript/Hono API, PostgreSQL schema/migrations, and automated tests.
- New REST API surface for groups, menus, attendance, feedback, leaves, and preparation states.
- Render services: static frontend, web API, managed PostgreSQL, environment variables, health check, and database migration release step.
