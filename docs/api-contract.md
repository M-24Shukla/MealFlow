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

Creating a group assigns the creator both `ADMIN` and `CONSUMER` roles and generates an immutable UUID invitation token (`Group.slug`). Administrators can approve or reject requests. A join request chooses `CONSUMER` (diner) or `PRODUCER` (cook).

Only active administrators can list members or change an administrator role. A promotion preserves the consumer role and is rejected for any producer. The creator's roles are immutable, and the creator cannot be removed. Administrative member endpoints reject self-removal and changes to the caller's own admin role. Member lists include `userId` and `isCreator` so the UI can hide unavailable actions.
Reapproving a removed member replaces their old roles with the approved join role;
previous administrator privileges are not restored automatically.

## Schedule and menus

Group opening uses `GET /groups/:groupId/workspace?date=YYYY-MM-DD`, with optional
`mealType` for a cook's initial selection. This returns only that weekday's effective
menus, that date's cook leave, and the caller's dated attendance.
Consumer and producer sections are included only for roles verified by the server.
The consumer section includes weekly menu templates, recurring rules, and vacations
for the attendance panel displayed by default; these reuse the menu read within the request.
For producers, diner counts for every displayed meal are computed from one date-wide
attendance snapshot and included with the menu. Preparation data for one selected meal
reuses that snapshot; other meals use
the existing preparation endpoint on selection. Unassigned meals return no preparation
data while leaving the remaining workspace usable.

`GET /groups/:groupId/workspace/preferences` loads weekly menus and the caller's
recurring attendance, vacations, onboarding preferences, and cook leave history on demand.
`GET /groups/:groupId/workspace/admin` combines pending requests and members and
requires the admin role. All workspace responses use `Cache-Control: private, no-store`.
The saved-food catalogue, leave plans, and action-item lists load on demand.
`GET /groups/:groupId/action-items?status=PENDING|COMPLETED` filters the action-item
list after a selection; omitting status retains the existing all-items behavior.
Existing resource and write endpoints remain available.
Workspace JSON is serialized without indentation. Its `Server-Timing` response header
reports `auth` (session checks/renewal), `groupAuth` (membership/role checks), and
`workspaceData` (data loading) durations in milliseconds, including database waits.

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

### AI menu import

Admins can use **+ Menu → Import from AI** to copy a schema prompt and paste the
AI's JSON. No AI service or API key is required by the application.

`POST /api/v1/groups/:groupId/menus/import` accepts:

```json
{"menus":[{"weekday":1,"mealType":"BREAKFAST","items":[{"name":"Poha","category":"VEG","recipeUrl":null,"notes":null}]}]}
```

This imports recurring weekly menus (Monday=1 through Sunday=7), not dated menus.
Meal types: `BREAKFAST`, `BRUNCH`, `LUNCH`, `SNACKS`, `DINNER`.
Categories: `VEG`, `NON_VEG`, `EGG`, `VEGAN`. Names contain 1–120 characters;
optional nullable notes contain at most 1000 characters; optional nullable recipe
links must be HTTP(S) URLs. Unknown fields are rejected. A batch contains 1–35
unique weekday/meal combinations, each with 1–50 items. Import replaces all dishes
in the specified combinations only, preserving unspecified weekly menus and dated
overrides. The entire batch is validated before one database transaction; failures
roll back all changes. Returns `{"imported":1}`; invalid JSON/schema returns 400,
unauthorized users follow the existing group admin authorization rules.
