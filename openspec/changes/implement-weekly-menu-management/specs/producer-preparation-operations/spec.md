## Purpose

Give producer members a daily operational view of their availability, expected diners, and each menu item's preparation status.

## ADDED Requirements

### Requirement: Producer availability
The system SHALL allow an active producer to record recurring weekly off-days and dated leave records, optionally limited to a meal type and accompanied by a reason; leave SHALL take effect immediately and SHALL not require administrator approval.

#### Scenario: Producer requests meal leave
- **WHEN** an active producer requests leave for a specified dinner date with a reason
- **THEN** the system records the leave for that producer and meal immediately

### Requirement: Meal preparation board
The system SHALL provide authorized administrators and assigned active producers a preparation view for a group meal occurrence that includes expected headcount and one preparation record for each menu item.

#### Scenario: Preparation board is opened
- **WHEN** an authorized producer opens today's dinner preparation board
- **THEN** the system returns the dinner menu items, their statuses, and expected headcount

### Requirement: Preparation state transitions
The system SHALL initialize each item preparation record as `UNPREPARED` and allow an authorized administrator or assigned active producer to change it to `IN_PROGRESS` or `PREPARED`.

#### Scenario: Producer marks an item in progress
- **WHEN** an assigned active producer changes an unprepared item to `IN_PROGRESS`
- **THEN** the system persists the new status and identifies the updating producer

#### Scenario: Unauthorized preparation update is rejected
- **WHEN** an unassigned consumer attempts to update an item preparation status
- **THEN** the system denies the update and preserves the prior status
