# AgentDispatch REST API Reference

Base URL: `http://{host}:{port}/api/v1`

When `auth.enabled` is `true`, all endpoints except `/health` and `POST /api/v1/auth/login` require the `Authorization: Bearer <token>` header.

---

## Endpoint Summary

### Auth

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| POST | `/api/v1/auth/login` | Login with username and password | 200 |
| POST | `/api/v1/auth/logout` | Logout current session | 204 |
| GET | `/api/v1/auth/me` | Validate token and get current user info | 200 |

### Tasks

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| POST | `/api/v1/tasks` | Create a task | 201 |
| GET | `/api/v1/tasks` | List active tasks | 200 |
| GET | `/api/v1/tasks/archived` | List archived tasks | 200 |
| GET | `/api/v1/tasks/:id` | Get task by ID | 200 |
| PATCH | `/api/v1/tasks/:id` | Update task (worker-only) | 200 |
| DELETE | `/api/v1/tasks/:id` | Delete task | 204 |
| POST | `/api/v1/tasks/:id/claim` | Claim task | 200 |
| POST | `/api/v1/tasks/:id/release` | Release task | 200 |
| POST | `/api/v1/tasks/:id/progress` | Report progress | 200 |
| POST | `/api/v1/tasks/:id/complete` | Complete task (multipart) | 200 |
| POST | `/api/v1/tasks/:id/cancel` | Cancel task | 200 |
| POST | `/api/v1/tasks/:id/logs` | Append interaction logs | 204 |
| GET | `/api/v1/tasks/:id/logs` | Get interaction logs | 200 |
| GET | `/api/v1/tasks/:id/attachments` | List task attachments | 200 |
| GET | `/api/v1/tasks/:id/attachments/:filename` | Download attachment | 200 |
| GET | `/api/v1/tasks/:id/stream` | SSE stream for task status and logs | 200 |

### Clients

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| POST | `/api/v1/clients/register` | Register client | 201 |
| GET | `/api/v1/clients` | List all clients | 200 |
| GET | `/api/v1/clients/:id` | Get client by ID | 200 |
| DELETE | `/api/v1/clients/:id` | Unregister client | 204 |
| POST | `/api/v1/clients/:id/heartbeat` | Send heartbeat | 204 |
| PATCH | `/api/v1/clients/:id/agents` | Update agent list | 200 |
| POST | `/api/v1/clients/:id/logs` | Append client logs | 204 |

### Health

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/health` | Health check (no auth) | 200 |

---

## Authentication

### POST /api/v1/auth/login

**Request body:**
```json
{
  "username": "admin",
  "password": "secret"
}
```

**Response (200):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "expiresAt": "2026-03-02T12:00:00.000Z"
}
```

### POST /api/v1/auth/logout

No request body. Returns `204 No Content`.

### GET /api/v1/auth/me

**Response (200) — session token:**
```json
{
  "source": "session",
  "role": "admin",
  "username": "admin",
  "expiresAt": "2026-03-02T12:00:00.000Z"
}
```

**Response (200) — static token:**
```json
{
  "source": "static",
  "role": "client"
}
```

---

## Tasks

### POST /api/v1/tasks

Accepts either JSON body or `multipart/form-data` (with `data` field as JSON and optional `files` for attachments).

**Request body (JSON) — CreateTaskDTO:**
```json
{
  "title": "Process dataset",
  "description": "Run analysis on input.csv",
  "tags": ["analysis", "batch"],
  "priority": "normal",
  "metadata": { "datasetId": "abc123" },
  "callbackUrl": "https://example.com/webhook"
}
```

**Response (201):**
```json
{
  "id": "0224d6a7-dee0-4a37-a70d-a803d4807890",
  "title": "Process dataset",
  "description": "Run analysis on input.csv",
  "tags": ["analysis", "batch"],
  "priority": "normal",
  "status": "pending",
  "metadata": { "datasetId": "abc123" },
  "callbackUrl": "https://example.com/webhook",
  "createdAt": "2026-03-01T10:00:00.000Z",
  "updatedAt": "2026-03-01T10:00:00.000Z",
  "attachments": []
}
```

### GET /api/v1/tasks

**Query parameters:** `status`, `tag`, `page`, `limit`

### GET /api/v1/tasks/archived

**Query parameters:** `tag`, `search`, `page`, `limit`

### GET /api/v1/tasks/:id

Returns full task object including `claimedBy`, `progress`, `progressMessage`, `artifacts`, etc.

### PATCH /api/v1/tasks/:id

**Request body (UpdateTaskDTO):**
```json
{
  "title": "Updated title",
  "description": "Updated description",
  "tags": ["new-tag"],
  "priority": "high",
  "metadata": {}
}
```

### DELETE /api/v1/tasks/:id

Returns `204 No Content`.

### POST /api/v1/tasks/:id/claim

**Request body (ClaimTaskDTO):**
```json
{
  "clientId": "07d9de69-2114-43ec-9c70-79e22a0c0062",
  "agentId": "agent-1"
}
```

### POST /api/v1/tasks/:id/release

**Request body (ReleaseTaskDTO):**
```json
{
  "clientId": "07d9de69-2114-43ec-9c70-79e22a0c0062",
  "reason": "Agent restarted"
}
```

### POST /api/v1/tasks/:id/progress

**Request body (ProgressDTO):**
```json
{
  "clientId": "07d9de69-2114-43ec-9c70-79e22a0c0062",
  "agentId": "agent-1",
  "progress": 75,
  "message": "Processing batch 3 of 4",
  "logs": ["Step 1 done", "Step 2 done"]
}
```

### POST /api/v1/tasks/:id/complete

**Request:** `multipart/form-data` with:
- `zip` — artifact zip file (required)
- `result` — `result.json` file (required)

### POST /api/v1/tasks/:id/cancel

**Request body (CancelTaskDTO):**
```json
{
  "clientId": "07d9de69-2114-43ec-9c70-79e22a0c0062",
  "reason": "User requested cancellation"
}
```

### GET /api/v1/tasks/:id/attachments

**Response (200):**
```json
[
  {
    "originalName": "input.csv",
    "mimeType": "text/csv",
    "size": 1024
  }
]
```

### GET /api/v1/tasks/:id/attachments/:filename

Returns binary stream. Use `Content-Disposition` header for download filename.

### GET /api/v1/tasks/:id/stream

Server-Sent Events stream. Query params: `interval` (poll interval ms, default 2000), `logs` (set to `false` to exclude logs).

**Events:** `task`, `logs`, `done`, `error`

**Example:**
```javascript
const es = new EventSource('/api/v1/tasks/0224d6a7-dee0-4a37-a70d-a803d4807890/stream?interval=2000');
es.addEventListener('task', (e) => console.log(JSON.parse(e.data)));
es.addEventListener('logs', (e) => console.log(JSON.parse(e.data)));
es.addEventListener('done', (e) => { console.log(JSON.parse(e.data)); es.close(); });
```

### GET /api/v1/tasks/:id/logs

**Query parameters:** `after` (cursor for pagination)

### POST /api/v1/tasks/:id/logs

**Request body (AppendTaskLogsDTO):**
```json
{
  "clientId": "07d9de69-2114-43ec-9c70-79e22a0c0062",
  "agentId": "agent-1",
  "entries": [
    {
      "id": "log-1",
      "type": "step",
      "timestamp": "2026-03-01T10:05:00.000Z",
      "content": { "message": "Processing started" }
    }
  ]
}
```

Returns `204 No Content`.

---

## Clients

### POST /api/v1/clients/register

**Request body (RegisterClientDTO):**
```json
{
  "name": "Worker Node 1",
  "host": "192.168.1.10",
  "tags": ["prod", "gpu"],
  "dispatchMode": "manager",
  "agents": [
    {
      "id": "agent-1",
      "type": "worker",
      "command": "node worker.js",
      "workDir": "/app",
      "capabilities": ["python", "docker"]
    }
  ]
}
```

**Response (201):** Client object with `id`, `name`, `host`, `status`, `agents`, etc.

### POST /api/v1/clients/:id/heartbeat

**Request body (HeartbeatDTO):**
```json
{
  "agents": [
    {
      "id": "agent-1",
      "type": "worker",
      "status": "busy",
      "currentTaskId": "0224d6a7-dee0-4a37-a70d-a803d4807890",
      "capabilities": ["python"]
    }
  ]
}
```

Returns `204 No Content`.

### PATCH /api/v1/clients/:id/agents

**Request body:** Array of `AgentInfo` objects (same shape as in HeartbeatDTO).

### POST /api/v1/clients/:id/logs

**Request body (AppendClientLogsDTO):**
```json
{
  "entries": [
    {
      "id": "log-1",
      "timestamp": "2026-03-01T10:05:00.000Z",
      "level": "info",
      "message": "Agent started"
    }
  ]
}
```

Returns `204 No Content`.

---

## Health

### GET /health

**Response (200):**
```json
{
  "status": "ok",
  "version": "0.0.1",
  "authEnabled": true
}
```

---

## DTOs

| DTO | Fields |
|-----|--------|
| **CreateTaskDTO** | `title` (string), `description?`, `tags` (string[]), `priority?`, `metadata?`, `callbackUrl?` |
| **UpdateTaskDTO** | `title?`, `description?`, `tags?`, `priority?`, `metadata?` |
| **ClaimTaskDTO** | `clientId`, `agentId` |
| **ReleaseTaskDTO** | `clientId`, `reason?` |
| **ProgressDTO** | `clientId`, `agentId`, `progress` (0–100), `message?`, `logs?` |
| **CancelTaskDTO** | `clientId?`, `reason?` |
| **RegisterClientDTO** | `name`, `host`, `tags?`, `dispatchMode`, `agents` (AgentRegistration[]) |
| **HeartbeatDTO** | `agents?` (AgentInfo[]) |
| **CompleteTaskDTO** | `clientId`, `agentId`, `summary?` (sent via multipart `data` field when applicable) |
| **AppendTaskLogsDTO** | `clientId`, `agentId`, `entries` (InteractionLogEntry[]) |
| **AppendClientLogsDTO** | `entries` (ClientLogEntry[]) |

---

## Error Codes

| Code | HTTP | Description |
|------|------|--------------|
| TASK_NOT_FOUND | 404 | Task does not exist |
| TASK_ALREADY_CLAIMED | 409 | Task is already claimed by another worker |
| TASK_INVALID_TRANSITION | 400 | Invalid state transition for this operation |
| CLIENT_NOT_FOUND | 404 | Client does not exist |
| CLIENT_ALREADY_REGISTERED | 409 | Client already registered |
| CLIENT_OFFLINE | 400 | Client is offline |
| AGENT_NOT_FOUND | 404 | Agent does not exist |
| AGENT_BUSY | 409 | Agent is busy |
| UNAUTHORIZED | 401 | Missing or invalid token |
| FORBIDDEN | 403 | Insufficient permissions |
| VALIDATION_ERROR | 400 | Request validation failed |
| ARTIFACT_MISSING_ZIP | 400 | Complete request missing zip file |
| ARTIFACT_MISSING_RESULT | 400 | Complete request missing result.json |
| ARTIFACT_INVALID_JSON | 400 | result.json is invalid |
| ARTIFACT_HASH_MISMATCH | 400 | Artifact hash mismatch |
| QUEUE_FULL | 503 | Operation queue is full |
| AUTH_DISABLED | 404 | Authentication is not enabled |
| INTERNAL_ERROR | 500 | Unexpected server error |

---

## Standard Error Response

All errors return:

```json
{
  "error": {
    "code": "TASK_NOT_FOUND",
    "message": "Task 0224d6a7-dee0-4a37-a70d-a803d4807890 not found",
    "details": null
  },
  "timestamp": "2026-03-01T10:00:00.000Z"
}
```

The `details` field is optional and may contain additional context.
