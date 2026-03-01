# Authentication Guide

AgentDispatch supports optional token-based authentication. When enabled, all API requests (except `/health` and `POST /auth/login`) require a valid `Authorization: Bearer <token>` header.

---

## Enabling Authentication

Set `auth.enabled: true` in `server.config.json`:

```json
{
  "auth": {
    "enabled": true,
    "users": [{ "username": "admin", "password": "secret" }],
    "tokens": ["tok_client_abc", { "token": "tok_operator_xyz", "role": "operator" }]
  }
}
```

Or via environment variable:

```bash
DISPATCH_AUTH_ENABLED=true
```

---

## Token Types

### 1. Static String (default role: client)

```json
"tokens": ["tok_client_abc"]
```

Full access (client role). Used by Client Nodes and Workers.

### 2. Static Token with Role

```json
"tokens": [
  { "token": "tok_operator_xyz", "role": "operator" },
  { "token": "tok_admin_xyz", "role": "admin" }
]
```

### 3. Session Token (from login)

Obtained via `POST /api/v1/auth/login`:

```bash
curl -X POST http://localhost:9800/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"secret"}'
```

Response:

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "expiresAt": "2026-03-02T12:00:00.000Z"
}
```

Use the returned token in `Authorization: Bearer <token>`.

---

## Roles

| Role | Source | Permissions |
|------|--------|-------------|
| `admin` | Session (login) | Full access |
| `client` | Static token (default) | Full access — Client Nodes, Workers |
| `operator` | Static token (explicit) | Read + create/delete tasks only; **no** claim, release, progress, complete, cancel, patch, client register/heartbeat, log append |

**Operator-restricted endpoints:**

- `PATCH /tasks/:id`, `POST /tasks/:id/claim`, `POST /tasks/:id/release`
- `POST /tasks/:id/progress`, `POST /tasks/:id/complete`, `POST /tasks/:id/cancel`, `POST /tasks/:id/logs`
- `POST /clients/register`, `DELETE /clients/:id`, `POST /clients/:id/heartbeat`, `PATCH /clients/:id/agents`, `POST /clients/:id/logs`

Restricted requests return `403 FORBIDDEN`.

---

## Login Endpoint

| Method | Path | Body | Response |
|--------|------|------|----------|
| POST | `/api/v1/auth/login` | `{ username, password }` | `{ token, expiresAt }` |
| POST | `/api/v1/auth/logout` | — | `204` |

`/auth/logout` requires a valid Bearer token in the header.

---

## Worker Temporary Tokens (`wt_*`)

When `ClientConfig.token` is set, the Client Node issues temporary tokens for each Worker process:

- **Format:** `wt_<uuid>`
- **Injection:** `DISPATCH_TOKEN` and `DISPATCH_IPC_PATH` env vars
- **Lifecycle:** Created when a task is claimed; revoked when the task completes, cancels, or the Worker exits

Workers use these tokens for IPC calls (e.g. `dispatch worker progress`). No manual configuration needed.

---

## IPC Auth

When `ClientConfig.token` exists, the Client Node IPC channel validates worker-only commands:

- **CLI:** `dispatch --token <token> worker progress <taskId> --percent 50`
- **Or:** `DISPATCH_TOKEN=tok_xxx dispatch worker progress <taskId> --percent 50`

Token is validated against local Worker tokens or Server `GET /auth/me`. Only `admin` or `client` roles are allowed for worker operations.

---

## Dashboard Login

When auth is enabled, the Dashboard shows a login page. Users authenticate with credentials from `auth.users`. After login, the session token is stored and sent with API requests.

---

## Verify Token

```bash
curl -H "Authorization: Bearer <token>" http://localhost:9800/api/v1/auth/me
```

Response:

```json
{
  "source": "session",
  "role": "admin",
  "username": "admin",
  "expiresAt": "2026-03-02T12:00:00.000Z"
}
```

For static tokens:

```json
{
  "source": "static",
  "role": "client"
}
```
