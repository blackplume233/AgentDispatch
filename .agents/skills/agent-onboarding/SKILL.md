---
name: agent-onboarding
description: 'AgentDispatch 快速上手指南。教导任何 AI Agent 如何启动 Server、配置 Client Node、注册 Worker、提交任务并通过 SSE 流式监听任务状态。触发方式：用户提及 "/onboard"、"how to use dispatch"、"快速上手"、"set up agentdispatch" 等关键词时激活。'
license: MIT
allowed-tools: Shell, Read, Write, Glob, Grep
---

# AgentDispatch 快速上手指南

## 概述

AgentDispatch 是一个 AI Agent 任务分发平台。它将任务的**创建者**和**执行者**解耦：

- **Server** — 中心化的 REST API 服务器，负责任务管理、客户端注册和日志存储
- **Client Node** — 任务执行节点，轮询 Server 获取待处理任务，管理本地 Worker Agent
- **Worker** — 通过 ACP (Agent Client Protocol) 执行具体任务的 AI Agent
- **CLI** — `dispatch` 命令行工具，Worker 通过它与 Client Node 通信

```
┌──────────────────────┐         ┌──────────────────────────┐
│  任务提交方 (Agent)    │  HTTP   │      Server (:9800)       │
│  curl / fetch / SDK  │────────→│  REST API + File Store   │
└──────────────────────┘         │  + SSE Stream            │
                                 └──────────┬───────────────┘
                                            │ HTTP (poll)
                                 ┌──────────▼───────────────┐
                                 │     Client Node           │
                                 │  Task Poller + Dispatcher │
                                 │  IPC Server               │
                                 └──────────┬───────────────┘
                                            │ ACP (stdio)
                                 ┌──────────▼───────────────┐
                                 │   Worker Agent (ACP)      │
                                 │   dispatch CLI → IPC      │
                                 └──────────────────────────┘
```

---

## Step 1: 启动 Server

### 1.1 前置条件

- Node.js >= 20.0.0
- pnpm >= 9.x

### 1.2 安装依赖并构建

```bash
pnpm install
pnpm build
```

### 1.3 零配置启动（开发模式）

无需任何配置文件即可启动，所有参数使用默认值：

```bash
node packages/server/dist/index.js
```

Server 默认监听 `0.0.0.0:9800`，数据存储在 `./data/`。

### 1.4 自定义配置启动

**方式 A：环境变量**

```bash
DISPATCH_SERVER_PORT=8080 \
DISPATCH_DATA_DIR=./my-data \
DISPATCH_LOG_LEVEL=debug \
DISPATCH_AUTH_ENABLED=true \
DISPATCH_AUTH_TOKENS="tok_client_abc123,tok_operator_xyz:operator" \
node packages/server/dist/index.js
```

> `DISPATCH_AUTH_TOKENS` 格式：逗号分隔的 Token 列表，可用 `:role` 后缀指定角色（admin/client/operator），无后缀默认 client。

**方式 B：配置文件（`server.config.json`）**

在项目根目录或 `DISPATCH_CONFIG_PATH` 指定的路径创建：

```json
{
  "host": "0.0.0.0",
  "port": 9800,
  "dataDir": "./data",
  "logLevel": "info",
  "auth": {
    "enabled": true,
    "users": [
      { "username": "admin", "password": "your-password" }
    ],
    "tokens": [
      "tok_client_abc123",
      { "token": "tok_operator_xyz", "role": "operator" }
    ]
  }
}
```

启用 `auth` 后所有 API（除 `/health` 和 `POST /auth/login`）需携带 `Authorization: Bearer <token>`。

### 1.5 验证 Server 就绪

```bash
curl http://localhost:9800/health
# 期望: {"status":"ok","version":"0.0.1","authEnabled":false}
```

### 1.6 关键环境变量一览

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DISPATCH_SERVER_HOST` | `0.0.0.0` | 监听地址 |
| `DISPATCH_SERVER_PORT` | `9800` | 监听端口 |
| `DISPATCH_DATA_DIR` | `./data` | 数据目录 |
| `DISPATCH_LOG_LEVEL` | `info` | 日志级别 |
| `DISPATCH_AUTH_ENABLED` | `false` | 启用鉴权 |
| `DISPATCH_AUTH_TOKENS` | — | 逗号分隔的静态 Token（可附 `:role` 后缀，如 `tok_abc,tok_op:operator`） |

---

## Step 2: 配置 Client Node

### 2.1 创建配置文件

在 Client Node 工作目录创建 `client.config.json`：

```json
{
  "name": "my-node-01",
  "serverUrl": "http://localhost:9800",
  "token": "tok_client_abc123",
  "tags": ["code-review", "documentation"],
  "dispatchMode": "tag-auto",
  "polling": { "interval": 10000 },
  "heartbeat": { "interval": 30000 },
  "ipc": { "path": "" },
  "autoDispatch": {
    "rules": [
      {
        "taskTags": ["code-review"],
        "targetAgentId": "worker-01",
        "priority": 10
      },
      {
        "taskTags": ["documentation"],
        "targetCapabilities": ["writing"],
        "priority": 5
      }
    ],
    "fallbackAction": "skip"
  },
  "logging": {
    "dir": "./logs",
    "rotateDaily": true,
    "retainDays": 30,
    "httpLog": true,
    "auditLog": true,
    "agentLog": true
  },
  "agents": []
}
```

### 2.2 配置说明

| 字段 | 必填 | 说明 |
|------|------|------|
| `name` | 是 | 唯一标识，Server 按此区分客户端 |
| `serverUrl` | 是 | Server 的 HTTP 地址 |
| `token` | 启用 auth 时必填 | Server 分配的 API Token |
| `tags` | 是 | 该节点能处理的任务类型标签 |
| `dispatchMode` | 是 | `tag-auto`（规则自动分发）/ `manager`（AI 调度）/ `hybrid` |
| `autoDispatch.rules` | `tag-auto` 或 `hybrid` 必填 | 按 task tag 匹配 Worker 的规则 |

### 2.3 分发模式

| 模式 | 适用场景 | 是否需要 Manager Agent |
|------|---------|:---------------------:|
| `tag-auto` | 简单规则匹配，任务标签对应固定 Worker | 否 |
| `manager` | 需要 AI 智能调度、复杂决策 | 是 |
| `hybrid` | Manager 优先，规则兜底 | 可选 |

### 2.4 启动 Client Node

```bash
node packages/client-node/dist/index.js
```

或指定配置文件：

```bash
node packages/client-node/dist/index.js --config ./my-config.json
```

---

## Step 3: 注册 Worker 到 Client Node

### 3.1 在配置文件中注册

Worker 在 `client.config.json` 的 `agents` 数组中注册：

```json
{
  "agents": [
    {
      "id": "worker-01",
      "type": "worker",
      "command": "claude --agent",
      "workDir": "/path/to/workspace",
      "capabilities": ["code-review", "refactoring"],
      "autoClaimTags": ["code-review"],
      "allowMultiProcess": false,
      "acpCapabilities": {
        "fs": { "readTextFile": true, "writeTextFile": true },
        "terminal": true
      },
      "permissionPolicy": "auto-allow"
    }
  ]
}
```

### 3.2 AgentConfig 字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | 是 | 唯一标识 |
| `type` | 是 | `worker`（执行任务）或 `manager`（调度顾问） |
| `command` | 是 | ACP Agent 的启动命令。必须支持 ACP 协议（JSON-RPC 2.0 over stdio） |
| `workDir` | 是 | Agent 工作目录，保留 Agent 自身 skills/rules |
| `capabilities` | 否 | Worker 能力标签，用于分发匹配 |
| `autoClaimTags` | 否 | 自动领取匹配这些 tag 的任务 |
| `allowMultiProcess` | 否 | 是否允许并行处理多任务，默认 `false` |
| `acpCapabilities` | 否 | 向 Agent 声明的 ACP 能力（文件读写、终端） |
| `permissionPolicy` | 否 | Agent 请求权限时的自动策略，默认 `auto-allow` |

### 3.3 Worker 生命周期

```
idle → claim 任务 → ACP 启动 → 执行任务 → 提交产物 → 完成/失败 → idle
```

Worker 进程启动后自动获得两个环境变量：
- `DISPATCH_TOKEN` — 临时 Token（`wt_<uuid>` 格式），任务结束自动撤销
- `DISPATCH_IPC_PATH` — 连接 Client Node 的 IPC 路径

### 3.4 Worker 通过 CLI 与系统交互

Worker 在任务执行过程中使用 `dispatch` CLI 命令（唯一的与外部系统交互通道）：

```bash
# 上报进度（触发 claimed → in_progress 状态转换）
dispatch worker progress <taskId> --percent 0 --message "分析代码中..."

# 追加日志
dispatch worker log <taskId> --message "发现 3 个潜在问题"

# 完成任务（提交产物）
dispatch worker complete <taskId> --zip ./output.zip --result ./result.json

# 报告失败
dispatch worker fail <taskId> --reason "无法访问代码仓库"

# 查询当前任务状态
dispatch worker status <taskId>

# 心跳（证明 Worker 仍在运行）
dispatch worker heartbeat <taskId>
```

---

## Step 4: 提交任务并监听状态

### 4.1 创建任务

**方式 A：JSON 请求**

```bash
curl -X POST http://localhost:9800/api/v1/tasks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer tok_client_abc123" \
  -d '{
    "title": "Review PR #42",
    "description": "Review the pull request for security issues and code quality.",
    "tags": ["code-review"],
    "priority": "high",
    "metadata": { "repo": "my-org/my-repo", "pr": 42 }
  }'
```

响应：

```json
{
  "id": "a1b2c3d4-...",
  "title": "Review PR #42",
  "status": "pending",
  "tags": ["code-review"],
  "priority": "high",
  "createdAt": "2026-03-01T12:00:00.000Z",
  "updatedAt": "2026-03-01T12:00:00.000Z"
}
```

**方式 B：带附件（multipart）**

```bash
curl -X POST http://localhost:9800/api/v1/tasks \
  -H "Authorization: Bearer tok_client_abc123" \
  -F 'data={"title":"Analyze dataset","tags":["data-analysis"],"priority":"normal"}' \
  -F 'files=@./dataset.csv' \
  -F 'files=@./config.yaml'
```

### 4.2 查询任务列表

```bash
# 所有活跃任务
curl http://localhost:9800/api/v1/tasks

# 按状态过滤
curl "http://localhost:9800/api/v1/tasks?status=pending"

# 按标签过滤
curl "http://localhost:9800/api/v1/tasks?tag=code-review"

# 分页
curl "http://localhost:9800/api/v1/tasks?page=1&limit=10"
```

### 4.3 查询单个任务

```bash
curl http://localhost:9800/api/v1/tasks/{taskId}
```

### 4.4 轮询方式监听（简单）

```bash
while true; do
  STATUS=$(curl -s http://localhost:9800/api/v1/tasks/{taskId} | jq -r '.status')
  echo "当前状态: $STATUS"
  if [ "$STATUS" = "completed" ] || [ "$STATUS" = "failed" ] || [ "$STATUS" = "cancelled" ]; then
    echo "任务结束"
    break
  fi
  sleep 2
done
```

### 4.5 SSE 流式监听（推荐）

**Server 提供 `GET /api/v1/tasks/:id/stream` SSE 端点**，建立长连接后持续推送任务状态变化和日志。

```bash
curl -N "http://localhost:9800/api/v1/tasks/{taskId}/stream?interval=1000&logs=true"
```

**查询参数**：

| 参数 | 默认 | 说明 |
|------|------|------|
| `interval` | `2000` | 轮询间隔（ms），范围 500-30000 |
| `logs` | `true` | 是否推送交互日志 |

**SSE 事件类型**：

| 事件 | 说明 | 数据结构 |
|------|------|---------|
| `task` | 任务状态或进度变化 | `{ id, status, progress, progressMessage, claimedBy, updatedAt, completedAt }` |
| `logs` | 新的交互日志 | `InteractionLogEntry[]` |
| `done` | 任务到达终态 | `{ taskId, finalStatus }` |
| `error` | 轮询出错 | `{ message }` |

**JavaScript/TypeScript 示例**：

```typescript
function watchTask(serverUrl: string, taskId: string, token?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = `${serverUrl}/api/v1/tasks/${taskId}/stream?interval=1000&logs=true`;
    const es = new EventSource(url);

    es.addEventListener('task', (e) => {
      const data = JSON.parse(e.data);
      console.log(`[${data.status}] ${data.progressMessage ?? ''}`);
    });

    es.addEventListener('logs', (e) => {
      const entries = JSON.parse(e.data);
      for (const entry of entries) {
        console.log(`  [${entry.type}] ${entry.content.slice(0, 80)}`);
      }
    });

    es.addEventListener('done', (e) => {
      const data = JSON.parse(e.data);
      es.close();
      resolve(data.finalStatus);
    });

    es.addEventListener('error', () => {
      es.close();
      reject(new Error('SSE connection error'));
    });
  });
}
```

**Node.js（无 EventSource）示例**：

```typescript
import http from 'node:http';

function streamTask(serverUrl: string, taskId: string): void {
  const url = new URL(`/api/v1/tasks/${taskId}/stream?interval=1000`, serverUrl);

  http.get(url, (res) => {
    let buffer = '';
    res.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      let currentEvent = '';
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7);
        } else if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));
          console.log(`[${currentEvent}]`, data);

          if (currentEvent === 'done') {
            res.destroy();
            return;
          }
        }
      }
    });
  });
}
```

---

## 任务状态机

```
pending → claimed → in_progress → completed
                                → failed → pending (可重新领取)
         → cancelled
```

| 状态 | 说明 |
|------|------|
| `pending` | 等待被领取 |
| `claimed` | 已被 Worker 领取，尚未开始执行 |
| `in_progress` | 正在执行中（首次 progress 上报触发） |
| `completed` | 已完成（产物已提交） |
| `failed` | 执行失败（可通过 release 回到 pending） |
| `cancelled` | 已取消（终态） |

---

## 完整端到端示例

以下是一个完整的工作流程脚本，展示从 Server 启动到任务提交再到 SSE 监听的全过程：

```bash
#!/bin/bash
# === 1. 启动 Server ===
DISPATCH_DATA_DIR=/tmp/dispatch-demo \
  node packages/server/dist/index.js &
SERVER_PID=$!
sleep 2

# === 2. 验证 Server ===
curl -s http://localhost:9800/health | jq .

# === 3. 提交任务 ===
TASK_ID=$(curl -s -X POST http://localhost:9800/api/v1/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"Demo Task","tags":["demo"],"priority":"normal"}' \
  | jq -r '.id')
echo "Created task: $TASK_ID"

# === 4. SSE 流式监听 ===
curl -N "http://localhost:9800/api/v1/tasks/$TASK_ID/stream?interval=1000" &
STREAM_PID=$!

# === 5. 模拟 Worker 操作 ===
# 领取任务
curl -s -X POST "http://localhost:9800/api/v1/tasks/$TASK_ID/claim" \
  -H "Content-Type: application/json" \
  -d '{"clientId":"node-01","agentId":"worker-01"}'

sleep 1

# 上报进度
curl -s -X POST "http://localhost:9800/api/v1/tasks/$TASK_ID/progress" \
  -H "Content-Type: application/json" \
  -d '{"clientId":"node-01","agentId":"worker-01","progress":0,"message":"Working..."}'

sleep 2

# 完成任务（需要 multipart 上传 zip + result.json）
# 此处省略真实产物上传...

# === 6. 清理 ===
kill $STREAM_PID 2>/dev/null
kill $SERVER_PID 2>/dev/null
rm -rf /tmp/dispatch-demo
```

---

## Token 鉴权快速参考

启用 `auth.enabled: true` 后：

| 角色 | 用途 | 权限 |
|------|------|------|
| `admin` | Dashboard 登录用户 | 完全权限 |
| `client` | Client Node / Worker | 完全权限（包括 claim/complete 等） |
| `operator` | 外部集成（只提交任务） | 可创建/删除/查看任务；**禁止** claim/release/progress/complete/cancel |

```bash
# 登录获取 session token (admin)
curl -X POST http://localhost:9800/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your-password"}'

# 使用 static token
curl -H "Authorization: Bearer tok_client_abc123" \
  http://localhost:9800/api/v1/tasks
```

---

## REST API 快速参考

### 任务管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/v1/tasks` | 创建任务 |
| `GET` | `/api/v1/tasks` | 查询活跃任务（?status=&tag=&page=&limit=） |
| `GET` | `/api/v1/tasks/:id` | 获取单个任务 |
| `PATCH` | `/api/v1/tasks/:id` | 更新任务（worker-only） |
| `DELETE` | `/api/v1/tasks/:id` | 删除任务 |
| `POST` | `/api/v1/tasks/:id/claim` | 领取任务（worker-only） |
| `POST` | `/api/v1/tasks/:id/release` | 释放任务（worker-only） |
| `POST` | `/api/v1/tasks/:id/progress` | 上报进度（worker-only） |
| `POST` | `/api/v1/tasks/:id/complete` | 完成任务（multipart，worker-only） |
| `POST` | `/api/v1/tasks/:id/cancel` | 取消任务（worker-only） |
| `GET` | `/api/v1/tasks/:id/stream` | **SSE 流式监听任务状态和日志** |
| `GET` | `/api/v1/tasks/:id/logs` | 获取交互日志（?after=） |
| `POST` | `/api/v1/tasks/:id/logs` | 追加交互日志（worker-only） |

### 客户端管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/v1/clients/register` | 注册客户端（worker-only） |
| `GET` | `/api/v1/clients` | 列出所有客户端 |
| `GET` | `/api/v1/clients/:id` | 获取客户端详情 |
| `DELETE` | `/api/v1/clients/:id` | 注销客户端（worker-only） |
| `POST` | `/api/v1/clients/:id/heartbeat` | 心跳（worker-only） |

### 鉴权

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/v1/auth/login` | 用户名密码登录 |
| `POST` | `/api/v1/auth/logout` | 注销 session |
| `GET` | `/api/v1/auth/me` | 验证 token |
| `GET` | `/health` | 健康检查（无需鉴权） |

---

## 常见错误码

| 错误码 | HTTP | 说明 |
|--------|------|------|
| `TASK_NOT_FOUND` | 404 | 任务不存在 |
| `TASK_ALREADY_CLAIMED` | 409 | 任务已被其他 Worker 领取 |
| `TASK_INVALID_TRANSITION` | 400 | 当前状态不允许此操作 |
| `UNAUTHORIZED` | 401 | Token 缺失或无效 |
| `FORBIDDEN` | 403 | 角色权限不足 |
| `VALIDATION_ERROR` | 400 | 请求参数校验失败 |
| `ARTIFACT_MISSING_ZIP` | 400 | 完成任务时缺少 zip |
| `ARTIFACT_MISSING_RESULT` | 400 | 完成任务时缺少 result.json |

---

## 数据目录结构

```
{dataDir}/
├── tasks/           # 活跃任务 (.json + .md)
├── tasks-archive/   # 归档任务
├── attachments/     # 任务输入附件
├── artifacts/       # 任务产物 (zip + result.json)
├── clients/         # 客户端注册信息
└── logs/            # 日志
    ├── tasks/       # 按任务 ID 的交互日志 (.jsonl)
    ├── clients/     # 按客户端 ID 的日志
    └── server-*.jsonl  # Server 主日志
```
