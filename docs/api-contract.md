# API contract — v1

Base URL: `/api/v1`. JSON only. Authentication is required for every endpoint. The server derives `actorUserId` from the signed-in identity header/session; it is never accepted from clients.

Error body:

```json
{"error":{"code":"FORBIDDEN","message":"Consumer membership is required.","requestId":"req_123"}}
```

Common errors: `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `409 CONFLICT`, `429 RATE_LIMITED`.

## Groups and membership

| Method + path | Request | Success |
|---|---|---|
| `POST /groups` | `{ "name":"Maple House", "timezone":"Asia/Kolkata" }` | `201 { "id":"grp_…", "name":"Maple House", "timezone":"Asia/Kolkata", "myRole":"ADMIN" }` |
| `GET /groups` | — | `200 { "data":[Group] }` |
| `GET /groups/:groupId` | — | `200 Group` |
| `POST /groups/:groupId/invites` | `{ "role":"CONSUMER", "expiresAt":"2026-09-01T00:00:00Z", "maxUses":10 }` | `201 { "inviteToken":"plain-token-returned-once", "expiresAt":"…" }` |
| `POST /invites/:token/join` | — | `200 { "groupId":"grp_…", "role":"CONSUMER" }` |

`Group` includes `id`, `name`, `timezone`, `myRole`, and only membership details the caller is allowed to view.

## Schedule and menu administration

| Method + path | Request | Success |
|---|---|---|
| `PUT /groups/:groupId/schedule` | `{ "entries":[{"weekday":1,"mealType":"BREAKFAST","startTime":"08:00","endTime":"10:00","enabled":true}] }` | `200 { "entries":[ScheduleEntry] }` |
| `PUT /groups/:groupId/menus/:weekday/:mealType` | `{ "items":[{"name":"Poha","category":"VEG","recipeUrl":"https://…","sortOrder":1}] }` | `200 Menu` |
| `GET /groups/:groupId/menus?weekday=1` | — | `200 { "data":[Menu] }` |
| `GET /groups/:groupId/active-meal?at=2026-08-24T08:30:00Z` | — | `200 { "activeMeal": ActiveMeal \| null }` |

`weekday` is ISO 1=Monday through 7=Sunday. The API rejects schedule windows that overlap for the same group/weekday.

## Attendance and feedback

| Method + path | Request | Success |
|---|---|---|
| `PUT /groups/:groupId/my/recurring-absences` | `{ "rules":[{"weekday":1,"mealType":"LUNCH"}] }` | `200 { "rules":[…] }` |
| `PUT /groups/:groupId/my/attendance/:date/:mealType` | `{ "attendance":"ABSENT" }` | `200 { "date":"2026-08-24","mealType":"DINNER","attendance":"ABSENT" }` |
| `DELETE /groups/:groupId/my/attendance/:date/:mealType` | — | `204` |
| `GET /groups/:groupId/headcount?date=2026-08-24&mealType=DINNER` | — | `200 { "expected":18,"absent":3,"overrides":2 }` |
| `POST /groups/:groupId/meals/:date/:mealType/feedback` | `{ "rating":4,"comment":"Well seasoned." }` | `201 Feedback` |

Feedback requires active consumer membership and is idempotent by occurrence/member: use `PUT` instead of `POST` to edit an existing entry if edits are allowed.

## Producer operations

| Method + path | Request | Success |
|---|---|---|
| `PUT /groups/:groupId/my/producer-off-days` | `{ "weekdays":[7] }` | `200 { "weekdays":[7] }` |
| `POST /groups/:groupId/my/leaves` | `{ "date":"2026-08-24","mealType":"DINNER","reason":"Travel" }` | `201 ProducerLeave` |
| `GET /groups/:groupId/preparation?date=2026-08-24&mealType=DINNER` | — | `200 { "occurrence":MealOccurrence,"headcount":18,"items":[PreparationLog] }` |
| `PATCH /groups/:groupId/preparation/:logId` | `{ "status":"IN_PROGRESS" }` | `200 PreparationLog` |

Only an admin or an assigned active producer may patch a preparation log. A status transition must be one of `UNPREPARED → IN_PROGRESS → PREPARED`, or an explicit admin reset.

## Data types

```ts
type MealType = 'BREAKFAST' | 'BRUNCH' | 'LUNCH' | 'SNACKS' | 'DINNER';
type FoodCategory = 'VEG' | 'NON_VEG' | 'EGG' | 'VEGAN';
type PreparationStatus = 'UNPREPARED' | 'IN_PROGRESS' | 'PREPARED';
type ActiveMeal = {
  date: string; mealType: MealType; startsAt: string; endsAt: string;
  items: Array<{id:string; name:string; category:FoodCategory; recipeUrl:string|null}>;
};
```
