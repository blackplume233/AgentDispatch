# Configuration Guide

AgentDispatch uses JSON config files and environment variables. This guide covers all configuration options.

## Override Priority

Configuration is resolved in order (lowest to highest priority):

1. **Code defaults** — Built-in values
2. **Config file** — `server.config.json` or `client.config.json`
3. **Environment variables** — `DISPATCH_*` prefixed
4. **CLI arguments** — `--flag` when applicable

Later sources override earlier ones.

---

## Server Configuration

**File:** `server.config.json` (project root, or path in `DISPATCH_CONFIG_PATH`)

| Section | Field | Type | Default | Description |
|---------|-------|------|---------|-------------|
| — | `host` | string | `0.0.0.0` | Bind address |
| — | `port` | number | `9800` | Listen port |
| — | `dataDir` | string | `./data` | Data storage root |
| — | `logLevel` | string | `info` | `debug` \| `info` \| `warn` \| `error` |
| `queue` | `maxSize` | number | `1000` | Max queue length |
| `queue` | `processInterval` | number | `100` | Queue process interval (ms) |
| `heartbeat` | `timeout` | number | `60000` | Client offline timeout (ms) |
| `heartbeat` | `checkInterval` | number | `15000` | Heartbeat check interval (ms) |
| `callbacks` | `retryCount` | number | `3` | Callback retry count |
| `callbacks` | `retryDelay` | number | `5000` | Callback retry delay (ms) |
| `attachments` | `dir` | string | `{dataDir}/attachments` | Attachment storage |
| `attachments` | `maxFileSizeBytes` | number | `52428800` | Max single file (50MB) |
| `attachments` | `maxTotalSizeBytes` | number | `209715200` | Max total per task (200MB) |
| `attachments` | `maxFileCount` | number | `20` | Max files per task |
| `artifacts` | `dir` | string | `{dataDir}/artifacts` | Artifact storage |
| `artifacts` | `maxZipSizeBytes` | number | `524288000` | Max zip size (500MB) |
| `artifacts` | `validateOnUpload` | boolean | `true` | Validate on upload |
| `artifacts` | `retainAfterDays` | number | `90` | Artifact retention (days) |
| `logging` | `dir` | string | `{dataDir}/logs` | Log directory |
| `logging` | `rotateDaily` | boolean | `true` | Rotate logs daily |
| `logging` | `retainDays` | number | `30` | Log retention (days) |
| `logging` | `httpLog` | boolean | `true` | Log HTTP requests |
| `logging` | `auditLog` | boolean | `true` | Log audit events |
| `archive` | `checkInterval` | number | `3600000` | Archive check interval (ms) |
| `archive` | `archiveAfterDays` | number | `1` | Days before archiving completed tasks |
| `archive` | `cacheMaxAge` | number | `3600000` | Archived detail cache TTL (ms) |
| `auth` | `enabled` | boolean | `false` | Enable token auth |
| `auth` | `users` | array | `[]` | `{ username, password }` for login |
| `auth` | `tokens` | array | `[]` | Static tokens (string or `{ token, role }`) |
| `auth` | `sessionTtl` | number | `86400000` | Session TTL (24h, ms) |

**Example `server.config.json`:**

```json
{
  "host": "0.0.0.0",
  "port": 9800,
  "dataDir": "./data",
  "logLevel": "info",
  "auth": {
    "enabled": true,
    "users": [{ "username": "admin", "password": "secret" }],
    "tokens": ["tok_client_abc", { "token": "tok_operator_xyz", "role": "operator" }]
  }
}
```

---

## Client Configuration

**File:** `client.config.json` (Client Node working directory, or path in `DISPATCH_NODE_CONFIG`)

| Section | Field | Type | Default | Description |
|---------|-------|------|---------|-------------|
| — | `name` | string | `default-node` | Client name (unique) |
| — | `serverUrl` | string | `http://localhost:9800` | Server URL |
| — | `token` | string | — | API token (required when auth enabled) |
| — | `tags` | string[] | `[]` | Client capability tags |
| — | `dispatchMode` | string | `tag-auto` | `tag-auto` \| `manager` \| `hybrid` |
| `polling` | `interval` | number | `10000` | Task poll interval (ms) |
| `ipc` | `path` | string | platform-specific | IPC socket/pipe path |
| `heartbeat` | `interval` | number | `30000` | Heartbeat interval (ms) |
| `autoDispatch` | `rules` | array | `[]` | Dispatch rules (tag-auto/hybrid) |
| `autoDispatch` | `fallbackAction` | string | `skip` | `skip` \| `queue-local` when no rule matches |
| `logging` | `dir` | string | `./logs` | Log directory |
| `logging` | `rotateDaily` | boolean | `true` | Rotate logs daily |
| `logging` | `retainDays` | number | `30` | Log retention (days) |
| `logging` | `httpLog` | boolean | `true` | Log outbound HTTP |
| `logging` | `auditLog` | boolean | `true` | Log audit events |
| `logging` | `agentLog` | boolean | `true` | Log agent interactions |
| — | `agents` | array | `[]` | Agent definitions |

### Agent Configuration

Each entry in `agents` has:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Agent ID |
| `type` | string | yes | `manager` \| `worker` |
| `command` | string | yes | ACP agent start command (e.g. `npx tsx ./agent.ts`) |
| `args` | string[] | no | Command arguments |
| `workDir` | string | yes | Working directory |
| `capabilities` | string[] | no | Worker capabilities |
| `promptTemplate` | string | no | Path to prompt template |
| `acpCapabilities` | object | no | `fs` / `terminal` permissions |
| `permissionPolicy` | string | no | `auto-allow` \| `auto-deny` \| `prompt` |

**`acpCapabilities` defaults:**

| Capability | Worker | Manager |
|------------|--------|---------|
| `fs.readTextFile` | true | true |
| `fs.writeTextFile` | true | false |
| `terminal` | true | false |

**Example `client.config.json`:**

```json
{
  "name": "my-node",
  "serverUrl": "http://localhost:9800",
  "token": "tok_xxx",
  "tags": ["gpu", "linux"],
  "dispatchMode": "tag-auto",
  "polling": { "interval": 10000 },
  "heartbeat": { "interval": 30000 },
  "autoDispatch": {
    "rules": [
      { "taskTags": ["code"], "targetCapabilities": ["code"], "priority": 10 }
    ],
    "fallbackAction": "skip"
  },
  "agents": [
    {
      "id": "worker-1",
      "type": "worker",
      "command": "node",
      "args": ["./worker.mjs"],
      "workDir": ".",
      "capabilities": ["code", "docs"]
    }
  ]
}
```

---

## Environment Variables

| Variable | Applies to | Description |
|----------|------------|-------------|
| `DISPATCH_CONFIG_PATH` | Server | Path to `server.config.json` |
| `DISPATCH_SERVER_HOST` | Server | Override `host` |
| `DISPATCH_SERVER_PORT` | Server | Override `port` |
| `DISPATCH_DATA_DIR` | Server | Override `dataDir` |
| `DISPATCH_LOG_LEVEL` | Server | Override `logLevel` |
| `DISPATCH_QUEUE_MAX_SIZE` | Server | Override queue max size |
| `DISPATCH_HEARTBEAT_TIMEOUT` | Server | Override heartbeat timeout |
| `DISPATCH_ARCHIVE_CHECK_INTERVAL` | Server | Override archive check interval |
| `DISPATCH_ARCHIVE_AFTER_DAYS` | Server | Override archive delay (days) |
| `DISPATCH_ARCHIVE_CACHE_MAX_AGE` | Server | Override archive cache TTL |
| `DISPATCH_AUTH_ENABLED` | Server | `true` \| `false` |
| `DISPATCH_AUTH_TOKENS` | Server | Comma-separated tokens, optional `:role` (e.g. `tok1,tok2:operator`) |
| `DISPATCH_NODE_CONFIG` | Client Node | Path to `client.config.json` |
| `DISPATCH_TOKEN` | CLI, Worker | Auth token for API/IPC |
| `DISPATCH_IPC_PATH` | Worker | IPC path (injected by Client Node) |

---

## Defaults Table

| Config | Default |
|--------|---------|
| Server port | `9800` |
| Queue max size | `1000` |
| Queue process interval | `100` ms |
| Heartbeat timeout | `60` s |
| Heartbeat check interval | `15` s |
| Polling interval | `10` s |
| Client heartbeat interval | `30` s |
| Callback retries | `3` |
| Callback retry delay | `5` s |
| Artifact zip max | `500` MB |
| Artifact validate on upload | `true` |
| Artifact retain | `90` days |
| Log rotation | daily |
| Log retain | `30` days |
