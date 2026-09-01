## Purpose

Allow consumer members to express recurring and date-specific meal attendance, and collect feedback only from eligible group consumers.

## ADDED Requirements

### Requirement: Recurring meal absence
The system SHALL allow an active consumer to record and replace their own recurring absence rules by weekday and meal type.

#### Scenario: Consumer saves a recurring absence
- **WHEN** an active consumer records absence for Monday lunch
- **THEN** the system applies that absence to future Monday lunch headcount calculations unless a dated override exists

### Requirement: Date-specific attendance override
The system SHALL allow an active consumer to set `PRESENT` or `ABSENT` for their own specific local meal date and meal type; a dated override SHALL take precedence over a recurring absence rule.

#### Scenario: Present override defeats recurring absence
- **WHEN** a consumer with a recurring Monday lunch absence sets a specific Monday lunch to `PRESENT`
- **THEN** the consumer is included in the expected headcount for that date and meal

### Requirement: Expected headcount
The system SHALL calculate expected headcount from active consumer memberships, recurring absences, and dated attendance overrides, and SHALL return the resulting count only to authorized administrators and producers.

#### Scenario: Producer views diner count
- **WHEN** an authorized producer requests the headcount for a scheduled meal
- **THEN** the system returns the count after applying the attendance precedence rules

### Requirement: Consumer-only feedback
The system SHALL allow an active consumer member to submit one rating from 1 through 5 and one comment for a group meal occurrence; users without an active consumer membership SHALL be denied.

#### Scenario: Eligible consumer submits feedback
- **WHEN** an active consumer submits a valid rating and comment for a meal occurrence
- **THEN** the system stores the feedback and associates it with that consumer membership

#### Scenario: Producer attempts feedback
- **WHEN** a producer without a consumer membership submits feedback for a meal occurrence
- **THEN** the system denies the request
