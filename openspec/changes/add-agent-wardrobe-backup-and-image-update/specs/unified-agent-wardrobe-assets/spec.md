## ADDED Requirements
### Requirement: Agent Can Export Closet Data
The system SHALL allow unified-agent to prepare a closet export for the current user without dumping the raw export payload directly into the assistant message body.

#### Scenario: Export closet data from chat
- **WHEN** the user asks unified-agent to export their closet data
- **THEN** the agent can call a dedicated export tool
- **AND** the tool returns a compact task result summary
- **AND** any large export payload is returned through attachment-like metadata or a download-oriented result instead of raw inline JSON

### Requirement: Agent Can Import Closet Data With Confirmation
The system SHALL allow unified-agent to import closet data for the current user only after explicit confirmation.

#### Scenario: Import closet data after confirmation
- **WHEN** the user provides a valid closet import payload and asks unified-agent to import it
- **THEN** the agent prepares an import confirmation summary that includes the expected item count
- **AND** the import only executes after the user confirms
- **AND** the final task result summarizes how many items were inserted

### Requirement: Agent Can Update Cloth Image For Existing Item
The system SHALL allow unified-agent to replace the image of an existing cloth item while preserving the current image validation and size limits used by the manual update flow.

#### Scenario: Replace cloth image from current cloth context
- **WHEN** the current agent context focuses on an existing cloth item
- **AND** the user provides a new image and asks unified-agent to update that item
- **THEN** the agent can call a dedicated image-update tool for that cloth
- **AND** the tool enforces the same image validation rules as the existing update route
- **AND** the confirmed task result points back to the updated cloth item
