# Cross-Layer Thinking Guide

> **Purpose**: Before implementing, map how data crosses AgentDispatch layers and define each boundary contract.

---

## The Problem

Most production bugs happen **between layers**, not inside one function.

In AgentDispatch, the core cross-layer paths are:

```
Dashboard/API Client
    ↕ HTTP
Server (REST + queue + file persistence)
    ↕ HTTP
ClientNode Core
    ↕ ACP (stdio JSON-RPC)
Worker / Manager Agent process
    ↕ CLI shell calls
ClientCLI
    ↕ IPC (pipe/socket)
ClientNode Core
```

Every arrow is a contract surface: payload format, state transition, auth rule, timeout, and error mapping.

---

## AgentDispatch Layer Map

| Layer                    | Responsibility                           | Communication                       |
| ------------------------ | ---------------------------------------- | ----------------------------------- |
| **Dashboard**            | 任务可视化、操作入口                     | HTTP(S) to Server                   |
| **Server**               | 任务状态机、持久化、鉴权、SSE            | REST/SSE + file I/O                 |
| **ClientNode Core**      | 轮询/认领、Worker 生命周期、ACP/IPC 协调 | HTTP + ACP + IPC                    |
| **ClientCLI**            | 本地命令入口（用户/Worker）              | IPC to ClientNode                   |
| **Worker/Manager Agent** | 任务执行/分发建议                        | ACP + shell (`dispatch worker ...`) |
| **Shared Types**         | 跨模块契约类型与错误码                   | TS type contracts                   |

---

## Before Implementing Cross-Layer Features

### Step 1: Map the End-to-End Flow

Write the full path before coding.

```
Example: Worker reports progress

Worker process
  → shell: dispatch worker progress <taskId> --percent 0 --message "Thinking..."
  → ClientCLI parses args
  → IPC message (command=worker.progress, payload)
  → ClientNode validates token/role
  → HTTP POST /tasks/:id/progress
  → Server validates transition claimed -> in_progress
  → Dashboard refreshes task state (polling/SSE)
```

For each step, answer:

- Which payload schema is used?
- Which component validates it?
- What is the timeout/retry policy?
- Which error code is returned on failure?

### Step 2: Identify Boundary Risks

| Boundary                     | Common Issues                                                    |
| ---------------------------- | ---------------------------------------------------------------- |
| Dashboard ↔ Server           | DTO drift, missing auth header, stale polling behavior           |
| Server ↔ persistence         | non-atomic write, partial file, archive index drift              |
| ClientNode ↔ Server          | task status race, heartbeat timeout, retry storm                 |
| ClientCLI ↔ ClientNode (IPC) | command mismatch, payload shape mismatch, token missing          |
| ClientNode ↔ Agent (ACP)     | initialize hang, stopReason handling, stream chunk fragmentation |
| Worker ↔ ClientCLI           | wrong task id, missing artifact paths, progress semantics misuse |

### Step 3: Define the Contract Explicitly

For each boundary, define:

- Input and output schema
- Allowed state transitions
- Auth/permission checks
- Error code mapping
- Idempotency and retry behavior

Update `api-contracts.md` and `config-spec.md` in the same change set.

---

## Common AgentDispatch Cross-Layer Mistakes

### Mistake 1: Task state jump

**Symptom**: `completeTask` fails with `TASK_INVALID_TRANSITION`.

**Cause**: calling complete before the first progress update moves task into `in_progress`.

**Fix**: ensure progress is reported first (progress value is trigger field, message is real status text).

### Mistake 2: Streaming chunk fragmentation

**Symptom**: Dashboard shows many tiny unreadable logs.

**Cause**: recording every ACP chunk as an independent log row.

**Fix**: buffer `text/thinking/prompt` chunks and flush on structural boundaries (`tool_call`, `plan`, turn end).

### Mistake 3: Artifact cross-task contamination

**Symptom**: task B artifact zip includes files from task A.

**Cause**: collecting artifacts from whole `workDir`.

**Fix**: keep ACP `newSession.cwd = agentConfig.workDir` and collect only from
`{workDir}/.dispatch/output/{taskId-prefix}/`.

### Mistake 4: Fake QA flow instead of real components

**Symptom**: tests look green but real dispatch flow breaks.

**Cause**: using curl/scripts to mimic heartbeats, progress, or artifact upload.

**Fix**: run real Server + real ClientNode + real ACP-capable Worker in QA.

### Mistake 5: IPC auth documented but schema incomplete

**Symptom**: CLI sends token but IPC layer drops it.

**Cause**: contract text and `IPCMessage` schema diverge.

**Fix**: keep schema and command table synchronized in `api-contracts.md`.

---

## Cross-Layer Checklist

### Before Implementation

- [ ] End-to-end flow is written for this feature
- [ ] Every crossed boundary has explicit input/output schema
- [ ] Shared types/errors are updated in one place
- [ ] Auth role impact (`admin/client/operator`) is reviewed

### During Implementation

- [ ] Status transitions follow documented state machine
- [ ] Worker communication goes through CLI -> IPC -> ClientNode
- [ ] ACP stopReason paths are handled (`end_turn`, `cancelled`, `refused`, limits)
- [ ] Timeout/retry behavior is explicit (heartbeat, HTTP retry, reconnect)

### After Implementation

- [ ] Verify normal + failure paths across all touched layers
- [ ] Verify logs are human-readable and correlated by task/client/session
- [ ] Verify no contract drift against `api-contracts.md` and `config-spec.md`
- [ ] Verify backend behavior against `.trellis/spec/backend/index.md`

---

## Layer Dependency Rules

```
Dashboard/CLI tools -> Server/ClientCLI -> ClientNode Core -> Agent Process
                                       \-> Shared Types (contracts)
```

Rules:

1. Worker never calls Server API directly.
2. Dashboard never bypasses Server to mutate runtime state.
3. ClientCLI is transport only; business rules stay in ClientNode/Server.
4. Shared contracts are source of truth for cross-module payloads.
5. Spec updates are mandatory when contract or state behavior changes.

---

## When to Write a Dedicated Flow Doc

Create `.trellis/tasks/{task-name}/flow.md` when any of these apply:

- Feature spans 3+ layers
- New auth/pathway/error code is introduced
- External protocol behavior changes (ACP/IPC/SSE)
- Existing bug came from boundary race or contract drift
