---
id: 12
title: "feat: support chained task decomposition (parent-subtask hierarchy)"
status: open
labels:
  - enhancement
  - "priority:P2"
milestone: null
author: actant-cursor-agent
assignees: []
relatedIssues: []
relatedFiles: []
taskRef: null
githubRef: "blackplume233/AgentDispatch#12"
closedAs: null
createdAt: "2026-03-02T06:01:49Z"
updatedAt: "2026-03-02T06:02:07"
closedAt: null
---

## Background

The current `Task` model is flat — each task is independent. In real-world scenarios, an Agent may receive a complex task that it cannot complete in a single pass and needs to decompose it into several subtasks. The system currently has no mechanism to express parent-child relationships between tasks, nor the ability to automatically gate parent task completion based on subtask status.

## Requirements

### Core Semantics

- **Subtasks and parent tasks are fundamentally the same** — both are standard `Task` objects, linked through system fields
- A Task can have 0 or 1 `parentTaskId`
- A Task can have 0~N `subtaskIds`
- **A parent task can only be marked as completed when all subtasks have reached a terminal state (completed/failed/cancelled)**

### Task Model Changes

Add to `Task` interface in `packages/shared/src/types/task.ts`:

```typescript
parentTaskId?: string;    // Parent task ID, null means top-level task
subtaskIds?: string[];    // List of subtask IDs
```

Add to `CreateTaskDTO` in `packages/shared/src/types/dto.ts`:

```typescript
parentTaskId?: string;    // Specify parent task when creating a subtask
```

### API Behavior

1. **Create subtask** — When `POST /tasks` includes `parentTaskId`, the server automatically appends the new task ID to the parent's `subtaskIds`
2. **Completion validation** — When completing a parent task that has subtasks, the server checks all `subtaskIds` are in terminal state (completed/failed/cancelled); rejects if not all done
3. **Cascade cancel** (optional) — Cancelling a parent task optionally cascades to all incomplete subtasks
4. **Query enhancement** — `GET /tasks/:id` response includes `subtaskIds`; optionally support `?expand=subtasks` to inline subtask details
5. **Progress aggregation** (optional) — Parent task `progress` can auto-aggregate as weighted average of subtask progress

### State Transition Rules

| Scenario | Behavior |
|----------|----------|
| Create subtask | Parent auto-transitions to `in_progress` if still `pending`/`claimed` |
| All subtasks completed | Parent becomes eligible for completion (not auto-completed; Agent must trigger) |
| Subtask fails | Parent does NOT auto-fail; Agent decides to retry, skip, or fail parent |
| Cancel parent | Incomplete subtasks cascade-cancelled with `reason: "parent cancelled"` |
| Cancel subtask | No impact on parent; only updates the subtask's own status |

### Agent-Side Behavior

In `packages/client-node`, when an Agent Worker decides to decompose a task:

1. Call `POST /tasks` to create N subtasks (`parentTaskId` = current task ID)
2. Subtasks enter the dispatch queue via normal tag matching, claimable by same or different Agents
3. Agent can poll or use callbacks to monitor subtask completion
4. Once all subtasks complete, Agent aggregates results and completes the parent task

## Affected Scope

- `packages/shared/src/types/task.ts` — Task interface new fields
- `packages/shared/src/types/dto.ts` — CreateTaskDTO new field
- `packages/server/src/services/task-service.ts` — Create/complete/cancel logic
- `packages/server/src/routes/task-routes.ts` — API endpoint enhancements
- `packages/server/src/store/` — Storage layer parent-child query support
- `packages/client-node/` — Agent Worker task decomposition support
- `packages/dashboard/` — UI to display parent-child task tree

## Non-Goals (out of v1 scope)

- Depth nesting limit (v1 has no depth restriction; configurable `maxDepth` later)
- Subtask dependency ordering (v1 subtasks are all parallel; no DAG scheduling)
- Auto-decomposition strategies (v1 leaves decomposition decisions entirely to the Agent)
