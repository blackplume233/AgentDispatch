# OpenCode Migration Rules

This project was migrated from Claude/Cursor command systems.

## Always-on Ship Testing Convention

During ship review, run **incremental tests** instead of the full suite:

- Use the project's incremental test command which only runs tests related to uncommitted changes.
- Only fall back to full test suite when explicitly requested or when changes touch shared infrastructure (for example: test config, tsconfig, dependency files).

## Compatibility Notes

- Legacy command families are preserved in `.claude/` and `.cursor/`.
- OpenCode commands are available in `.opencode/commands/`.
- Prefer `/trellis/<name>` for Trellis commands.
