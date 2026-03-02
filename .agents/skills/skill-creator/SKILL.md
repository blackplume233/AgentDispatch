---
name: skill-creator
description: Create and migrate Trellis command/skill assets using a centralized .agents source-of-truth, with compatible references for Claude Code, Cursor, and OpenCode command directories.
license: MIT
allowed-tools: Read, Write, Glob, Grep
---

# Skill Creator

Use this skill to maintain command and skill authoring in a single place.

## Goal

Keep real command and skill content in `.agents/`, and make platform command files in `.claude/`, `.cursor/`, and `.opencode/` thin references.

## Source of Truth

- Skill content: `.agents/skills/<skill-name>/`
- Command source docs: `.agents/skills/<skill-name>/commands/`
- Platform wrappers:
  - Claude Code: `.claude/commands/trellis/<name>.md`
  - Cursor: `.cursor/commands/trellis-<name>.md`
  - OpenCode: `.opencode/commands/trellis/<name>.md`

## Execution Docs

- Claude Code flow: `commands/claude.md`
- Cursor flow: `commands/cursor.md`
- OpenCode flow: `commands/opencode.md`
