## ADDED Requirements
### Requirement: Agent Can Generate Outfit Preview From Current Match Draft
The system SHALL allow unified-agent to generate a真人预览图 from the current match draft context after the user hands off one top item and one bottom item from the match page.

#### Scenario: Generate preview from current match draft
- **WHEN** the current agent context contains a match-page suit draft with one top item and one bottom item
- **AND** the user asks the agent to generate a真人预览图 for the current look
- **THEN** the agent can call a tool that resolves the current top, bottom, user sex, and character model
- **AND** the tool returns the generated preview image back into the chat flow

### Requirement: Agent Reply Can Accumulate Media Results Across Multiple Tool Calls
The system SHALL preserve media attachments from sequential autonomous tool calls in the same user turn.

#### Scenario: Show current items then generate preview in one turn
- **WHEN** the agent first calls a media tool that returns the current clothing images
- **AND** the agent then calls another media tool that returns the generated真人预览图
- **THEN** the final assistant reply keeps both the original clothing images and the generated preview image in the same chat response context
