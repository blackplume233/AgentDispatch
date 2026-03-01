# Task Management Guide

This guide covers creating, monitoring, and managing tasks in AgentDispatch.

## Creating Tasks

### JSON Request

Send a `POST` request to `/api/v1/tasks` with `Content-Type: application/json`:

```bash
curl -X POST http://localhost:9800/api/v1/tasks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "title": "Process dataset",
    "description": "Run analysis on input.csv",
    "tags": ["data", "analysis"],
    "priority": "normal"
  }'
```

**Request body (CreateTaskDTO):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | yes | Task title |
| `description` | string | no | Markdown description |
| `tags` | string[] | yes | Tags for dispatch matching |
| `priority` | string | no | `low` \| `normal` \| `high` \| `urgent` |
| `metadata` | object | no | Custom metadata |
| `callbackUrl` | string | no | Webhook URL on completion |

### Multipart Request (with Attachments)

Upload files with the task using `multipart/form-data`:

- **`data`** — JSON string of CreateTaskDTO
- **`files`** — One or more attachment files

```bash
curl -X POST http://localhost:9800/api/v1/tasks \
  -H "Authorization: Bearer <token>" \
  -F 'data={"title":"Analyze report","description":"Review perf-report.csv","tags":["review"],"priority":"high"}' \
  -F "files=@perf-report.csv" \
  -F "files=@config.json"
```

---

## Status Lifecycle

Tasks follow this state machine:

```
pending → claimed → in_progress → completed
   ↑          ↑             → failed → pending (re-claimable)
   │          │             → pending (heartbeat timeout release)
   │          └─ pending (heartbeat timeout release)
   └──────────────────────── cancelled
```

| Status | Description |
|--------|-------------|
| `pending` | Awaiting a Worker to claim |
| `claimed` | Claimed by a Client/Agent, not yet started |
| `in_progress` | Worker is actively processing |
| `completed` | Successfully finished with artifacts |
| `failed` | Worker reported failure; can be re-claimed |
| `cancelled` | Cancelled by user or system |

**Valid transitions:**

| From | To |
|------|-----|
| `pending` | `claimed`, `cancelled` |
| `claimed` | `in_progress`, `pending`, `cancelled` |
| `in_progress` | `completed`, `failed`, `cancelled`, `pending` |
| `completed` | _(terminal)_ |
| `failed` | `pending` |
| `cancelled` | _(terminal)_ |

---

## Monitoring Tasks

### List Active Tasks

```bash
curl "http://localhost:9800/api/v1/tasks?status=pending&tag=code&page=1&limit=20"
```

Query parameters: `status`, `tag`, `page`, `limit`.

### Get Task Detail

```bash
curl http://localhost:9800/api/v1/tasks/{taskId}
```

Returns full task including `claimedBy`, `artifacts`, `attachments`, etc. Supports archived tasks (Server fetches from archive if not in active store).

### SSE Stream (Real-time Updates)

Subscribe to task status and logs via Server-Sent Events:

```bash
curl -N "http://localhost:9800/api/v1/tasks/{taskId}/stream?interval=2000&logs=true"
```

| Parameter | Default | Description |
|-----------|---------|-------------|
| `interval` | `2000` | Poll interval (ms), 500–30000 |
| `logs` | `true` | Include interaction logs |

Events: `task` (status updates), `logs` (new log entries), `done` (terminal status), `error`.

**JavaScript example:**

```javascript
const es = new EventSource(`/api/v1/tasks/${taskId}/stream?interval=1000&logs=true`);
es.addEventListener('task', (e) => console.log('Status:', JSON.parse(e.data)));
es.addEventListener('done', (e) => { console.log('Finished'); es.close(); });
```

---

## Cancelling Tasks

```bash
curl -X POST http://localhost:9800/api/v1/tasks/{taskId}/cancel \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"reason": "User requested", "clientId": "<owner-client-id>"}'
```

- `clientId` is optional. If provided, it must match the task owner (for Worker-initiated cancel). Omit for admin/system cancels.

---

## Artifacts

Completed tasks must include artifacts:

1. **`artifact.zip`** — Zip of all output files
2. **`result.json`** — Structured result description

**result.json schema:**

```json
{
  "taskId": "uuid",
  "success": true,
  "summary": "Human-readable summary",
  "outputs": [
    { "name": "report.md", "type": "file", "path": "report.md", "description": "..." }
  ],
  "errors": [],
  "metrics": { "durationMs": 1200 }
}
```

**Download artifacts:**

```bash
# List artifact files
curl http://localhost:9800/api/v1/tasks/{taskId}/artifacts/files

# Download zip
curl -O http://localhost:9800/api/v1/tasks/{taskId}/artifacts/download
```

---

## Archived Tasks

Terminal tasks are archived after a configurable delay (default 1 day). Use:

```bash
# List archived tasks (TaskSummary[])
curl "http://localhost:9800/api/v1/tasks/archived?tag=code&search=fix&page=1&limit=20"

# Get archived task detail (same endpoint as active)
curl http://localhost:9800/api/v1/tasks/{taskId}
```

Archived tasks return a lighter payload; full detail is loaded on demand with a 1h cache.
