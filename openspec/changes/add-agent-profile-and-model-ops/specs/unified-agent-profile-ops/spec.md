## ADDED Requirements
### Requirement: Agent Can Update User Name
The system SHALL allow unified-agent to update the current user's display name after explicit confirmation.

#### Scenario: Update user name from chat
- **WHEN** the user asks unified-agent to change their display name
- **THEN** the agent can prepare a confirmation summary with the target name
- **AND** the update only executes after the user confirms
- **AND** the final result points the user back to the personal profile area

### Requirement: Agent Can Upload Avatar
The system SHALL allow unified-agent to update the current user's avatar using an image attachment while preserving the same image constraints as the manual profile flow.

#### Scenario: Upload avatar from image attachment
- **WHEN** the user provides an image and asks unified-agent to set it as avatar
- **THEN** the agent can stage an avatar update confirmation
- **AND** the confirmed update enforces the current avatar file size and type rules
- **AND** the result summarizes that the avatar has been updated

### Requirement: Agent Can Upload Or Delete Character Model
The system SHALL allow unified-agent to upload or delete the current user's character model with explicit confirmation.

#### Scenario: Upload character model from image attachment
- **WHEN** the user provides a valid full-body image and asks unified-agent to set it as character model
- **THEN** the agent can stage a character model upload confirmation
- **AND** the confirmed update enforces the current character model image rules

#### Scenario: Delete current character model
- **WHEN** the user asks unified-agent to remove the current character model
- **THEN** the agent stages a destructive confirmation
- **AND** the delete only executes after the user confirms
