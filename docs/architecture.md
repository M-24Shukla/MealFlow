# Architecture and decisions

## Core rules

- A user has a role per group membership, not globally. A person can be a consumer in one group and a producer/admin in another.
- Group configuration uses an IANA timezone. All timestamps are stored as UTC ISO-8601; dates are evaluated in the group timezone.
- Meal availability is a configurable `startTime` and `endTime`, not an implicit enum ordering. This resolves overlapping and overnight-meal ambiguity.
- A `meal_occurrence` is materialized for a group/date/meal type when preparation or feedback begins. Static weekly templates are never mutated by operations.
- A dated attendance override wins over a recurring rule. If neither exists, attendance defaults to present for active consumer members.
- An invite token is used to join a group. Never expose a reusable raw group UUID as an invitation credential.

## Authorization matrix

| Action | Admin | Consumer | Producer |
|---|---:|---:|---:|
| Read group/menu | yes | yes | yes |
| Configure schedule/menu | yes | no | no |
| Create/revoke invite | yes | no | no |
| Manage own attendance | yes | yes | no |
| Submit feedback | no* | yes | no |
| View headcount/preparation | yes | no | yes |
| Manage own leave/off-days | no | no | yes |
| Update preparation status | yes | no | assigned producer |

`*` An admin who is also a consumer through a separate membership role needs an explicit product decision; the proposed MVP permits feedback only when the membership role is `CONSUMER`.

## Active meal algorithm

1. Convert the request time to the group timezone.
2. Select that weekday's enabled schedule entries where the local time falls in `[startTime, endTime)`.
3. Reject overlapping configured time windows at validation time. If none matches, return `activeMeal: null`.
4. Resolve the matching weekly menu and its items. Return recipe URLs; the UI redirects only after the user selects an item, avoiding unexpected navigation.

## Headcount algorithm

`eligible consumers − recurring absent rules + dated PRESENT overrides − dated ABSENT overrides`.

Only active group members with the `CONSUMER` role count. A specific override wins over the weekly rule. The API returns both the count and an explanation list for auditability.

## Configuration checklist

| Area | Required value | Owner |
|---|---|---|
| Identity | SIWC client/configuration and protected route policy | platform admin |
| Database | D1 binding `DB`; migration execution identity | platform admin |
| App | `APP_ORIGIN`, allowed CORS origins, log level | engineering |
| Time | IANA timezone per group; default timezone policy | product/admin |
| Security | CSP, rate limits, audit log retention, error tracking DSN | engineering/security |
| Email/notifications | Provider API key, sender, templates (only if enabled) | product/ops |
| Audio reporting | consent copy, retention period, R2 binding, transcription provider/key | product/legal/engineering |

## Missing requirements / decisions needed

1. Who can create groups and assign roles: any signed-in user, or a workspace administrator only?
2. Can one membership hold multiple roles, especially admin + consumer? If so, replace the single `role` column with `membership_roles`.
3. What are the exact meal time windows, how are overnight windows handled, and can schedules overlap?
4. Does a producer leave require admin approval, and what happens if every assigned producer is unavailable?
5. Should absence default to present, absent, or require an RSVP cutoff? May users edit attendance after that cutoff?
6. Should feedback be anonymous to producers/admins, editable, or restricted to only meals actually attended?
7. Is the product internal-only, or do external residents need sign-in? The authentication path changes materially for public/external users.
8. For audio ingredient reports: which transcription provider, supported languages, consent text, data-retention period, and who can view raw audio?

## Explicitly deferred scopes

- Ingredient inventory, shopping assignment, and cost settlement.
- Meal capacity/guest invitations and headcount cutoffs.
- Allergens, nutrition, dietary preferences, and food safety workflows.
- Notifications, exports, audit UI, and producer substitution.
- Offline/mobile apps, multi-language UI, and SSO beyond the selected workspace identity.
