# AgentDispatch CLI Reference

The `dispatch` command controls the ClientNode and communicates with it via IPC. All commands (except `start`) require a running ClientNode.

## Global Options

| Option | Description | Default |
|--------|-------------|---------|
| `--ipc <path>` | IPC socket path | Platform-specific (see below) |
| `--token <token>` | Auth token for IPC commands | `DISPATCH_TOKEN` env var |

**Authentication:** Use `--token <token>` or set `DISPATCH_TOKEN` for IPC authentication when the node requires it.

```bash
# Via flag
dispatch --token my-secret-token status

# Via environment variable
export DISPATCH_TOKEN=my-secret-token
dispatch status
```

**Default IPC paths:**
- Windows: `\\.\pipe\dispatch-default-node`
- Unix: `$XDG_RUNTIME_DIR/dispatch-default-node.sock` or `/tmp/dispatch-{uid}/dispatch-default-node.sock`

---

## Node Management

| Command | Description |
|---------|-------------|
| `start` | Start a ClientNode process |
| `stop` | Stop the ClientNode |
| `status` | Show node status |
| `register` | Register the node with the server |
| `unregister` | Unregister the node from the server |

### start

Start a ClientNode process.

```bash
dispatch start [--config <path>] [--foreground]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--config <path>` | Path to `client.config.json` | `client.config.json` |
| `--foreground` | Run in foreground (default: background) | `false` |

**Examples:**
```bash
dispatch start
dispatch start --config ./my-client.json
dispatch start --config ./prod.json --foreground
```

### stop

Stop the ClientNode.

```bash
dispatch stop [--force]
```

| Option | Description |
|--------|-------------|
| `--force` | Force stop without graceful shutdown |

### status

Show node status.

```bash
dispatch status
```

### register

Register the node with the server.

```bash
dispatch register --server <url>
```

| Option | Description |
|--------|-------------|
| `--server <url>` | Server base URL (e.g. `http://localhost:9800`) |

### unregister

Unregister the node from the server.

```bash
dispatch unregister
```

---

## Agent Management

| Command | Description |
|---------|-------------|
| `agent add` | Register a new agent |
| `agent remove` | Remove an agent |
| `agent list` | List all agents |
| `agent status` | Show agent details |
| `agent restart` | Restart an agent |

### agent add

Register a new agent.

```bash
dispatch agent add --type <manager|worker> --command <cmd> --workdir <dir> [options]
```

| Option | Description | Required |
|--------|-------------|----------|
| `--type <type>` | Agent type: `manager` or `worker` | Yes |
| `--command <cmd>` | ACP command to run the agent | Yes |
| `--workdir <dir>` | Working directory | Yes |
| `--id <id>` | Agent ID (auto-generated if omitted) | No |
| `--tags <tags>` | Comma-separated capability tags | No |
| `--auto-claim` | Enable auto-claim for matching tags | No |
| `--multi-process` | Allow multiple processes per agent | No |

**Examples:**
```bash
dispatch agent add --type worker --command "node worker.js" --workdir /app
dispatch agent add --type manager --command "python manager.py" --workdir /app --tags python,docker --auto-claim
```

### agent remove

Remove an agent.

```bash
dispatch agent remove <agentId>
```

### agent list

List all agents.

```bash
dispatch agent list [--status <status>]
```

| Option | Description |
|--------|-------------|
| `--status <status>` | Filter by status (e.g. `idle`, `busy`) |

### agent status

Show agent details.

```bash
dispatch agent status <agentId>
```

### agent restart

Restart an agent.

```bash
dispatch agent restart <agentId>
```

---

## Task Management

| Command | Description |
|---------|-------------|
| `task list` | List local tasks |
| `task assign` | Manually assign a task to an agent |
| `task release` | Release a task |
| `task log` | View task logs |

### task list

List local tasks.

```bash
dispatch task list [--status <status>]
```

| Option | Description |
|--------|-------------|
| `--status <status>` | Filter by task status |

### task assign

Manually assign a task to an agent.

```bash
dispatch task assign <taskId> <agentId>
```

### task release

Release a task.

```bash
dispatch task release <taskId> [--reason <reason>]
```

| Option | Description |
|--------|-------------|
| `--reason <reason>` | Release reason |

### task log

View task logs.

```bash
dispatch task log <taskId> [--follow]
```

| Option | Description |
|--------|-------------|
| `--follow` | Stream logs continuously |

---

## Worker Commands

Worker agents use these commands to report progress, complete tasks, and send heartbeats. They communicate with the ClientNode via IPC; the node forwards operations to the server.

| Command | Description |
|---------|-------------|
| `worker progress` | Report task progress |
| `worker complete` | Complete task with artifacts |
| `worker fail` | Report task failure |
| `worker status` | Query task status |
| `worker log` | Append a log entry for a task |
| `worker heartbeat` | Send worker heartbeat |

### worker progress

Report task progress.

```bash
dispatch worker progress <taskId> --percent <0-100> [--message <msg>]
```

| Option | Description | Required |
|--------|-------------|----------|
| `--percent <number>` | Progress percentage (0–100) | Yes |
| `--message <msg>` | Progress message | No |

**Example:**
```bash
dispatch worker progress 0224d6a7-dee0-4a37-a70d-a803d4807890 --percent 50 --message "Processing batch 2"
```

### worker complete

Complete a task with artifacts.

```bash
dispatch worker complete <taskId> --zip <path> --result <path>
```

| Option | Description | Required |
|--------|-------------|----------|
| `--zip <path>` | Path to artifact zip file | Yes |
| `--result <path>` | Path to `result.json` file | Yes |

**Example:**
```bash
dispatch worker complete 0224d6a7-dee0-4a37-a70d-a803d4807890 --zip ./out/artifact.zip --result ./out/result.json
```

### worker fail

Report task failure.

```bash
dispatch worker fail <taskId> --reason <reason> [--zip <path>] [--result <path>]
```

| Option | Description | Required |
|--------|-------------|----------|
| `--reason <reason>` | Failure reason | Yes |
| `--zip <path>` | Optional artifact zip | No |
| `--result <path>` | Optional result JSON | No |

### worker status

Query task status.

```bash
dispatch worker status <taskId>
```

### worker log

Append a log entry for a task.

```bash
dispatch worker log <taskId> --message <msg>
```

| Option | Description | Required |
|--------|-------------|----------|
| `--message <msg>` | Log message | Yes |

### worker heartbeat

Send a heartbeat for an in-progress task.

```bash
dispatch worker heartbeat <taskId>
```

---

## Configuration

| Command | Description |
|---------|-------------|
| `config show` | Show current configuration |
| `config set` | Set a configuration value |
| `config edit` | Open the configuration file in the default editor |

### config show

Show current configuration.

```bash
dispatch config show
```

### config set

Set a configuration value using dot-notation.

```bash
dispatch config set <key> <value> [--config <path>]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--config <path>` | Path to `client.config.json` | `client.config.json` |

**Examples:**
```bash
dispatch config set polling.interval 5000
dispatch config set server.url "http://localhost:9800"
```

Values are parsed as JSON when possible (`true`, `false`, `null`, numbers, arrays, objects).

### config edit

Open the configuration file in the default editor.

```bash
dispatch config edit [--config <path>]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--config <path>` | Path to `client.config.json` | `client.config.json` |

Uses `$EDITOR` or `$VISUAL`; falls back to `vi` on Unix.
