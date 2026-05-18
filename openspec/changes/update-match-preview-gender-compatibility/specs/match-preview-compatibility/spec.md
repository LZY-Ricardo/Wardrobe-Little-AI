## ADDED Requirements
### Requirement: Match Page Hides Female Skirt Bottom Items For Male Profiles
The system SHALL hide pure female skirt bottom items from the match page when the active profile sex is `man`.

#### Scenario: Male profile opens bottom selection
- **WHEN** the user profile sex is `man`
- **AND** the match page prepares bottom-item candidates
- **THEN** items classified as pure female skirts are excluded from the rendered bottom-item list

### Requirement: Preview Generation Rejects Incompatible Male-Skirt Combinations
The system SHALL reject preview generation when a male profile attempts to generate a preview with a bottom item classified as a pure female skirt.

#### Scenario: Match page blocks incompatible generate action
- **WHEN** the user profile sex is `man`
- **AND** the selected bottom item is classified as a pure female skirt
- **AND** the user triggers preview generation from the match page
- **THEN** the UI does not submit the preview request
- **AND** the user receives a compatibility error message

#### Scenario: Backend route rejects incompatible direct request
- **WHEN** the preview generation route receives `sex=man`
- **AND** the provided bottom-item type metadata is classified as a pure female skirt
- **THEN** the route returns a client error
- **AND** the external preview workflow is not called

### Requirement: Unified Agent Enforces The Same Preview Compatibility Rule
The system SHALL apply the same male-profile skirt restriction when unified-agent generates a preview from the current match draft context.

#### Scenario: Agent blocks incompatible current look
- **WHEN** unified-agent resolves a current match draft with a bottom item classified as a pure female skirt
- **AND** the user asks the agent to generate the preview for that look
- **THEN** the agent returns an incompatibility response
- **AND** no preview image is generated
