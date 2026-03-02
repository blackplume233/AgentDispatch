---
description: "Router for trellis subcommands (use with /trellis/<subcommand>)"
---

Route the trellis command based on `$ARGUMENTS`.

Input format examples:
- `/ship ship`
- `ship`
- `/start`

Routing rules:
1. Normalize first token by removing leading `/`.
2. If token is one of:
   `start plan-start issue handle-pr watch-prs ship create-pr create-issue finish-work record-session review-code update-spec stage-version onboard parallel acp-dev integrate-skill check-backend check-frontend check-cross-layer before-backend-dev before-frontend-dev break-loop create-command qa-alpha qa-fix qa-watch`
   then follow command definition from `@.opencode/commands/trellis/<token>.md` and pass through remaining arguments.
3. If token is empty or unknown, show this help list and ask user to choose one valid subcommand.
