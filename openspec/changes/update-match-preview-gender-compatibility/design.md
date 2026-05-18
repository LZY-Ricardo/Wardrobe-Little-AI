## Context

This change adds a strict compatibility rule to the existing preview flow without redesigning the clothing schema. The current stack relies on string-based `type` values and a persisted `sex` profile field. That is enough for a conservative first-pass rule, but not enough for long-term fashion semantics.

## Goals / Non-Goals

- Goals:
  - block male-model preview generation for pure female skirt items everywhere in the preview flow
  - keep frontend, backend, and agent behavior aligned
  - preserve the current preview workflow integration
- Non-Goals:
  - no experimental mode
  - no image-based model-gender inference
  - no full wardrobe taxonomy redesign

## Decisions

- Decision: use keyword-based `type` matching for v1 compatibility checks
  - Alternatives considered: structured schema migration now
  - Rationale: lower-risk patch, smaller surface area, faster rollout

- Decision: validate compatibility at both UI and backend boundaries
  - Alternatives considered: frontend-only filtering
  - Rationale: frontend-only protection can be bypassed by cached state, direct API access, or agent tooling

- Decision: require lightweight bottom-type metadata in the backend request for the route version
  - Alternatives considered: changing the route to resolve cloth ids immediately
  - Rationale: minimal contract extension for the current multipart upload route

## Risks / Trade-offs

- Keyword classification may miss edge-case garment labels.
  - Mitigation: keep the list narrow and centralized, then migrate to structured fields later.

- Frontend and backend helper logic may drift.
  - Mitigation: give helpers the same function contract and add explicit regression tests.

## Migration Plan

1. Introduce helper modules and tests.
2. Wire frontend filtering and generate guard.
3. Extend backend request validation before preview generation.
4. Apply the same rule to unified-agent preview generation.
5. Validate the OpenSpec change and hold implementation until approved.

## Open Questions

- None for v1 after product direction was set to strict prohibition.
