## Purpose

Provide authenticated, role-scoped group membership so that each meal group can safely manage its own people and data.

## ADDED Requirements

### Requirement: Authenticated group creation
The system SHALL allow an authenticated user to create a group with a name and IANA timezone, record that user as the immutable group creator, and create active `ADMIN` and `CONSUMER` roles for that user in the group.

#### Scenario: Group is created
- **WHEN** an authenticated user submits a valid group name and timezone
- **THEN** the system creates the group, records its creator, and assigns that user active administrator and consumer roles

### Requirement: Landing-page join request
The system SHALL expose a shareable group landing page where an authenticated person can request to join as either a `CONSUMER` (diner) or `PRODUCER` (cook), without receiving access until approved by the group creator.

#### Scenario: Join request is submitted
- **WHEN** an authenticated person submits a valid consumer request from a group's landing page
- **THEN** the system records a pending join request and does not grant group data or member privileges

### Requirement: Creator-controlled join approval
The system SHALL allow only the recorded group creator to approve or reject a pending join request and SHALL require the creator to assign either the `CONSUMER` or `PRODUCER` role when approving it.

#### Scenario: Creator approves a cook
- **WHEN** the group creator approves a pending join request as a producer
- **THEN** the system activates producer access for that requester in the group

#### Scenario: Non-creator attempts approval
- **WHEN** any user other than the group creator attempts to approve a join request
- **THEN** the system denies the request without changing the join-request status

### Requirement: Group-scoped authorization
The system SHALL authorize every group operation from the caller's active membership and role in the requested group, rather than from a client-supplied user or role identifier.

#### Scenario: Unrelated member attempts a group operation
- **WHEN** an authenticated user without an active membership requests data or a write for a group
- **THEN** the system denies the request without returning group data

### Requirement: Creator-protected role management
The system SHALL support independent group roles. The group creator SHALL always retain `ADMIN` and `CONSUMER` roles; only the group creator can promote a consumer to `ADMIN` or demote an administrator; a producer SHALL never be promoted to `ADMIN`.

#### Scenario: Creator promotes a consumer
- **WHEN** the group creator promotes an active consumer
- **THEN** the consumer receives administrator permissions while retaining consumer permissions

#### Scenario: Administrator attempts to demote creator
- **WHEN** an administrator who is not the group creator attempts to demote the group creator
- **THEN** the system denies the request and preserves the creator's roles

#### Scenario: Producer promotion is rejected
- **WHEN** the group creator attempts to promote a producer to administrator
- **THEN** the system rejects the role change
