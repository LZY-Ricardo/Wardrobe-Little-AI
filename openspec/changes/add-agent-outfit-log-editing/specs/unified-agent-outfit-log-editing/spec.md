## ADDED Requirements
### Requirement: Agent Can Update Existing Outfit Log
The system SHALL allow unified-agent to update an existing outfit log after explicit confirmation.

#### Scenario: Update current outfit log from contextual state
- **WHEN** the current agent context focuses on an existing outfit log
- **AND** the user asks unified-agent to modify that log's scene, weather, satisfaction, note, date, or selected items
- **THEN** the agent can prepare an update confirmation for that outfit log
- **AND** the update only executes after the user confirms
- **AND** the final task result points back to the updated outfit log
