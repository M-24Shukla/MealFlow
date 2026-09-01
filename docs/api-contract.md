# API contract — v1

Base URL: `/api/v1`. The API runs as a Render Node.js/Hono web service and stores durable data in PostgreSQL. All JSON write endpoints derive the user from the secure session cookie; clients never send an authoritative user ID or role.

Error response:

```json
{"error":{"code":"REQUEST_ERROR","message":"Sign in is required."}}
```

## Authentication

| Method + path | Request | Success |
|---|---|---|
| `POST /auth/register` | `{ "email":"person@example.com", "password":"at-least-8-chars", "displayName":"Asha" }` | `201 { "user": User }` and session cookie |
| `POST /auth/login` | `{ "email":"person@example.com", "password":"at-least-8-chars" }` | `200 { "user": User }` and session cookie |
| `POST /auth/logout` | — | `204` and deleted session cookie |
| `GET /auth/me` | — | `200 { "user": User }` |

## Groups and join requests

| Method + path | Request | Success |
|---|---|---|
| `POST /groups` | `{ "name":"Maple House", "timezone":"Asia/Kolkata" }` | `201 { "group": Group }` |
| `GET /groups/public/:slug` | — | `200 { "group": PublicGroup }` |
| `POST /groups/public/:slug/join-requests` | `{ "requestedRole":"CONSUMER" }` | `201 { "request": JoinRequest }` |
| `GET /groups/:groupId/join-requests` | — | `200 { "data": [JoinRequest] }` |
| `POST /groups/:groupId/join-requests/:requestId/approve` | — | `200 { "id":"…", "status":"APPROVED" }` |
| `POST /groups/:groupId/join-requests/:requestId/reject` | — | `200 { "id":"…", "status":"REJECTED" }` |
| `GET /groups/:groupId/members` | — | `200 { "data": [Member] }` |
| `PUT /groups/:groupId/members/:membershipId/admin` | `{ "isAdmin":true }` | `200 { "membershipId":"…", "roles":["ADMIN","CONSUMER"] }` |

Creating a group assigns the creator both `ADMIN` and `CONSUMER` roles and generates an immutable UUID invitation token (`Group.slug`). The creator alone can approve or reject requests. A join request chooses `CONSUMER` (diner) or `PRODUCER` (cook).

Only the creator can list members or change an administrator role. A promotion preserves the consumer role and is rejected for any producer. The creator's roles are immutable.

## Schedule and menus

| Method + path | Request | Success |
|---|---|---|
| `GET /groups/:groupId/schedule` | — | `200 { "entries": [ScheduleEntry] }` |
| `PUT /groups/:groupId/schedule` | `{ "entries":[{"weekday":1,"mealType":"LUNCH","startTime":"12:00","endTime":"14:00","enabled":true}] }` | `200 { "entries": [ScheduleEntry] }` |
| `GET /groups/:groupId/menus?weekday=1` | — | `200 { "data": [Menu] }` |
| `PUT /groups/:groupId/menus/:weekday/:mealType` | `{ "items":[{"name":"Dal","category":"VEG","recipeUrl":"https://…"}] }` | `200 { "menu": Menu }` |
| `GET /groups/:groupId/active-meal?at=2026-08-24T06:30:00Z` | — | `200 { "activeMeal": ActiveMeal \| null }` |

Only active administrators can change schedules or menus. Meal windows are `HH:MM`, use the group's local ISO weekday, and cannot overlap when enabled. Active meal responses use the group's IANA timezone and return `activeMeal: null` when no window matches.

## Attendance and feedback

| Method + path | Request | Success |
|---|---|---|
| `PUT /groups/:groupId/my/recurring-absences` | `{ "rules":[{"weekday":1,"mealType":"LUNCH"}] }` | `200 { "rules": […] }` |
| `PUT /groups/:groupId/my/attendance/:date/:mealType` | `{ "attendance":"PRESENT" }` | `200 AttendanceOverride` |
| `DELETE /groups/:groupId/my/attendance/:date/:mealType` | — | `204` |
| `GET /groups/:groupId/headcount?date=2026-08-24&mealType=LUNCH` | — | `200 { "expected":18,"absent":3,"overrides":2 }` |
| `POST /groups/:groupId/meals/:date/:mealType/feedback` | `{ "rating":4,"comment":"Well seasoned." }` | `201 { "feedback": Feedback }` |
| `GET /groups/:groupId/meals/:date/:mealType/feedback` | — | `200 { "data": [Feedback] }` |

Only consumer members can manage their own attendance or feedback. A dated override wins over a recurring absence. Only administrators and producers can retrieve headcount, and a consumer can submit feedback only once per meal occurrence.

## Planned endpoints

Leaves and preparation endpoints are intentionally not published yet. Their required behavior and future task sequence are defined in [the approved OpenSpec change](../openspec/changes/implement-weekly-menu-management/).

## Data types

```ts
type User = { id: string; email: string; displayName: string };
type Group = { id: string; slug: string; name: string; timezone: string };
type PublicGroup = Pick<Group, 'slug' | 'name' | 'timezone'> & { isJoinable: boolean };
type JoinRequest = { id: string; requestedRole: 'CONSUMER' | 'PRODUCER'; status: 'PENDING' | 'APPROVED' | 'REJECTED' };
```
