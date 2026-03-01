# Dispatch Modes

AgentDispatch supports three task dispatch modes that control how pending tasks are assigned to Worker Agents.

## tag-auto Mode

Rules-based automatic dispatch. No Manager Agent required.

Tasks are matched to Workers using `autoDispatch.rules` in the client configuration. Rules are evaluated in descending `priority` order.

### How It Works

1. ClientNode polls the Server for pending tasks
2. For each task, rules are evaluated by priority (highest first)
3. A rule matches when all `taskTags` are present in the task's tags
4. The matched rule identifies a target Worker (by ID or capabilities)
5. If the Worker is idle, the task is claimed and dispatched

### Configuration

```json
{
  "dispatchMode": "tag-auto",
  "autoDispatch": {
    "rules": [
      {
        "taskTags": ["backend", "api"],
        "targetAgentId": "worker-backend",
        "priority": 10
      },
      {
        "taskTags": ["frontend"],
        "targetCapabilities": ["react", "typescript"],
        "priority": 5
      },
      {
        "taskTags": ["test"],
        "targetAgentId": "worker-test",
        "priority": 0
      }
    ],
    "fallbackAction": "skip"
  }
}
```

### DispatchRule Fields

| Field | Type | Description |
|-------|------|-------------|
| `taskTags` | `string[]` | Tags to match (AND logic — all must be present) |
| `targetAgentId` | `string` | Specific Worker to dispatch to |
| `targetCapabilities` | `string[]` | Match Workers by capabilities |
| `priority` | `number` | Rule priority (higher = evaluated first, default: 0) |

### Fallback Action

When no rule matches a task:

| Value | Behavior |
|-------|----------|
| `skip` | Task stays in pending pool (default) |
| `queue-local` | Task is queued locally for later processing |

## manager Mode

AI-powered dispatch using a Manager Agent via the Agent Client Protocol (ACP).

The Manager Agent receives task information and available Worker details, then recommends which Worker should handle the task.

### How It Works

1. ClientNode starts the Manager Agent as a persistent ACP session
2. When a pending task arrives, the Dispatcher returns a `consult-manager` decision
3. ClientNode sends a consultation prompt to the Manager Agent
4. The Manager responds with a `DispatchAdvice` (recommended Worker, confidence, reason)
5. If the recommendation is valid, the task is dispatched to that Worker

### Configuration

```json
{
  "dispatchMode": "manager",
  "agents": [
    {
      "id": "manager-agent",
      "type": "manager",
      "command": "claude-agent-acp",
      "workDir": "/path/to/manager/workdir",
      "acpCapabilities": {
        "fs": { "readTextFile": true, "writeTextFile": false },
        "terminal": false
      }
    },
    {
      "id": "worker-1",
      "type": "worker",
      "command": "claude-agent-acp",
      "workDir": "/path/to/worker/workdir",
      "capabilities": ["backend", "api"]
    }
  ]
}
```

### Requirements

- At least one agent with `"type": "manager"` must be configured
- The Manager Agent must support ACP protocol (JSON-RPC 2.0 over stdio)

## hybrid Mode

Combines Manager Agent intelligence with tag-auto rule fallback.

When the Manager Agent is available, it handles dispatch decisions. When unavailable (not started, crashed, or timed out), the system falls back to tag-auto rules.

### How It Works

1. If Manager Agent is online → uses Manager consultation (same as `manager` mode)
2. If Manager Agent is offline → falls back to `autoDispatch.rules` (same as `tag-auto` mode)

### Configuration

```json
{
  "dispatchMode": "hybrid",
  "autoDispatch": {
    "rules": [
      {
        "taskTags": ["backend"],
        "targetCapabilities": ["node", "typescript"],
        "priority": 5
      }
    ],
    "fallbackAction": "skip"
  },
  "agents": [
    {
      "id": "manager-agent",
      "type": "manager",
      "command": "claude-agent-acp",
      "workDir": "/path/to/manager/workdir"
    },
    {
      "id": "worker-backend",
      "type": "worker",
      "command": "claude-agent-acp",
      "workDir": "/path/to/worker/workdir",
      "capabilities": ["node", "typescript", "backend"]
    }
  ]
}
```

### Graceful Degradation

| Scenario | Behavior |
|----------|----------|
| Manager starts successfully | Manager handles all dispatch decisions |
| Manager fails to start | Falls back to tag-auto rules immediately |
| Manager crashes during operation | Automatically switches to tag-auto rules |
| Manager returns no advice | Task is skipped for that cycle |

## Mode Comparison

| Feature | tag-auto | manager | hybrid |
|---------|:--------:|:-------:|:------:|
| Manager Agent required | No | Yes | Optional |
| Dispatch rules required | Yes | No | Yes |
| AI-powered decisions | No | Yes | Yes (when available) |
| Fallback behavior | `fallbackAction` | Skip if unavailable | Tag rules |
| Startup complexity | Low | Medium | Medium |
| Best for | Simple, predictable workloads | Complex routing decisions | Reliability + intelligence |
