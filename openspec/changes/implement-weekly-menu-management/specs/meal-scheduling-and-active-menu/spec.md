## Purpose

Let group members reliably identify the active local meal and its recipe links from a configurable weekly schedule and menu.

## ADDED Requirements

### Requirement: Weekly meal scheduling
The system SHALL allow only active administrators to configure enabled meal entries for each ISO weekday, including meal type, start time, and end time.

#### Scenario: Configuring a weekday
- **WHEN** an active administrator saves Saturday breakfast, lunch, snacks, and dinner entries
- **THEN** those entries are available for that group's Saturday schedule

#### Scenario: Overlapping schedule is rejected
- **WHEN** an authorized member saves time windows that overlap on the same group and weekday
- **THEN** the system rejects the schedule and identifies the conflicting entries

### Requirement: Weekly menu management
The system SHALL allow only active administrators to associate each scheduled weekday/meal type with an ordered list of food items, each containing a name, category, and optional recipe link.

#### Scenario: Multi-item meal is saved
- **WHEN** an active administrator saves a dinner menu with two items and recipe links
- **THEN** members can retrieve both items in their configured order

### Requirement: Active meal resolution
The system SHALL determine a group's active meal from the current date and time in that group's configured IANA timezone, using the matching enabled schedule window and weekly menu.

#### Scenario: Active meal is returned
- **WHEN** the current local time falls within a configured Monday lunch window
- **THEN** the system returns Monday lunch and its configured food items and recipe links

#### Scenario: No meal is active
- **WHEN** the current local time does not fall within an enabled schedule window
- **THEN** the system returns an explicit no-active-meal result

### Requirement: Recipe-link access
The system SHALL present recipe links for an active meal's individual food items and SHALL not automatically navigate a member away from the group page when multiple items are active.

#### Scenario: Member opens an active meal
- **WHEN** a member views an active meal with multiple recipe links
- **THEN** the system displays the available items and their links for member selection
