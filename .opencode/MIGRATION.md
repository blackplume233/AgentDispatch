# OpenCode Migration Map

This repository now has OpenCode-native instruction assets while keeping legacy Claude/Cursor assets.

## Command Mapping

- Legacy `/trellis:start` or `/trellis-start` -> OpenCode `/trellis/start`
- Legacy `/trellis:plan-start` or `/trellis-plan-start` -> OpenCode `/trellis/plan-start`
- Legacy `/trellis:issue` or `/trellis-issue` -> OpenCode `/trellis/issue`
- Legacy `/trellis:handle-pr` or `/trellis-handle-pr` -> OpenCode `/trellis/handle-pr`
- Legacy `/trellis:watch-prs` or `/trellis-watch-prs` -> OpenCode `/trellis/watch-prs`
- Legacy `/qa` -> OpenCode `/qa`
- Legacy `.cursor/rules/qa-loop.mdc` trigger -> OpenCode `/qa-loop`

## Structure

- `opencode.json`: project-level OpenCode config
- `.opencode/commands/`: OpenCode commands
- `.opencode/agents/`: OpenCode subagents
- `.opencode/skills/`: OpenCode skills
- `.opencode/plugins/trellis-hooks.ts`: OpenCode plugin bridge for hook behavior

## Compatibility

Legacy directories are retained and not deleted:

- `.claude/`
- `.cursor/`
- `.agents/`
