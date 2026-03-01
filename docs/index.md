# AgentDispatch Documentation

AgentDispatch is a task dispatch platform for AI agents, supporting automated task distribution, execution monitoring, and artifact management. It uses a client–server architecture with a REST API, ClientNode runtime, and CLI for control and monitoring.

## Project Overview

- **Server** — Task hub with REST API and file-based persistence
- **ClientNode** — Client runtime managing Agent clusters via ACP protocol
- **ClientCLI** — Command-line interface (`dispatch`) for Node control and Worker communication
- **Dashboard** — Web-based visualization for tasks and clients
- **Shared** — Cross-module types, errors, and utilities

---

## Guides

| Guide | Description |
|-------|-------------|
| [Installation](guide/installation.md) | Install and run Server, ClientNode, and Dashboard |
| [Configuration](guide/configuration.md) | Server and client config files, environment variables |
| [Task Management](guide/task-management.md) | Create, monitor, cancel tasks; artifacts; archived tasks |
| [Dispatch Modes](guide/dispatch-modes.md) | `tag-auto`, `manager`, `hybrid` — rules and config examples |
| [Authentication](guide/authentication.md) | Enable auth, roles, login, Worker tokens, IPC auth |

---

## References

| Reference | Description |
|-----------|-------------|
| [REST API](api.md) | All endpoints, DTOs, error codes, and examples |
| [CLI](cli.md) | `dispatch` command reference — Node, Agent, Task, Worker, Config |

---

## Quick Links

- **Get started:** [Installation](guide/installation.md) → [Configuration](guide/configuration.md)
- **Create tasks:** [POST /api/v1/tasks](api.md#post-api-v1tasks)
- **Worker flow:** [Claim](api.md#post-api-v1tasksidclaim) → [Progress](api.md#post-api-v1tasksidprogress) → [Complete](api.md#post-api-v1tasksidcomplete)
- **CLI auth:** Use `--token` or `DISPATCH_TOKEN` — see [CLI Reference](cli.md#global-options)
