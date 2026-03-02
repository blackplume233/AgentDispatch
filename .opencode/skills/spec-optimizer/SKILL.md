---
name: spec-optimizer
description: Review and optimize project specs by finding omissions, redundancy, duplicate definitions, and cross-file conflicts, then drive a conflict-resolution workflow that asks the user one item at a time before applying edits. Use when users ask to audit spec quality, align contracts across modules, or clean documentation drift in .trellis/spec and related docs.
---

# Spec Optimizer

Run this workflow to improve specification quality without silently changing intent.

## Workflow

1. Define scope before editing.
2. Scan spec files and classify findings into four buckets:
   - Omission
   - Redundancy
   - Duplication
   - Conflict
3. Prioritize by severity:
   - P0: behavior/spec contradictions that can split implementation
   - P1: missing contract fields, broken links, incomplete matrices
   - P2: wording drift and style inconsistencies
4. Present findings first, with file+line references.
5. For each conflict, ask the user exactly one decision question at a time (A/B or A/B/C).
6. Apply only user-confirmed decisions.
7. Re-run consistency checks and summarize changed files.

## Output Contract

When reporting findings, use this structure:

- Severity + finding title
- Why it matters
- Evidence with explicit path and line
- Recommended options
- Single decision question

When reporting completion, include:

- Confirmed decisions list
- Files edited
- Residual risks or follow-ups

## Conflict Resolution Rules

1. Never auto-resolve semantic conflicts.
2. Never batch multiple conflict questions in one prompt unless user requests batching.
3. Keep options mutually exclusive and implementation-ready.
4. If one option has clear architectural alignment, recommend it explicitly.

## Editing Rules

1. Keep changes minimal and local to the agreed scope.
2. Preserve existing section structure unless restructuring is explicitly requested.
3. Update related tables/types/examples together to avoid partial drift.
4. When adding new fields to schema examples, update all corresponding command/DTO matrices.

## AgentDispatch Checklist

Always verify these high-risk areas after edits:

1. Task state machine diagram vs `TaskStatus` type.
2. IPC command matrix vs CLI command sections.
3. Auth/role text vs endpoint restrictions.
4. ACP `newSession.cwd` semantics vs artifact output directory docs.
5. Module count and architecture summary consistency across overview docs.

Read detailed patterns in `references/conflict-patterns.md` when needed.
