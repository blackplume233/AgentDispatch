---
name: agent-dispatch-use
description: 'AgentDispatch 使用指南。教导 AI Agent 如何启动 Server、配置 Client Node、将各种 Agent 作为 Worker 挂载到分发集群、提交任务并监听状态。触发方式：用户提及 "/onboard"、"how to use dispatch"、"快速上手"、"set up agentdispatch"、"挂载 Agent"、"mount worker" 等关键词时激活。'
license: MIT
allowed-tools: Shell, Read, Write, Glob, Grep
---

# AgentDispatch 使用指南

## 概述

AgentDispatch 是一个 AI Agent 任务分发平台。核心架构将任务**创建**与**执行**完全解耦：

| 组件 | 职责 |
|------|------|
| **Server** | 中心化 REST API 服务，管理任务队列、客户端注册、文件持久化、SSE 推送 |
| **Client Node** | 执行节点，轮询 Server 获取任务，调度和管理本地 Worker Agent 集群 |
| **Worker Agent** | 通过 ACP (Agent Client Protocol) 执行具体任务的 AI Agent |
| **Manager Agent** | 可选的 AI 调度顾问，通过 ACP 向 Client Node 提供分发建议 |
| **CLI** | `dispatch` 命令行工具，Worker 通过它上报进度、提交产物 |

```
                            ┌────────────────────────┐
  任务提交方                 │     Server (:9800)      │
  (curl / SDK / Dashboard)─→│  REST API + FileStore   │
                            │  SSE Stream + Auth      │
                            └────────┬───────────────┘
                                     │ HTTP (poll/claim/progress/complete)
                            ┌────────▼───────────────┐
                            │     Client Node         │
                            │  Dispatcher (tag/mgr)   │
                            │  AcpController          │
                            │  WorkerManager          │
                            │  IPC Server             │
                            └──┬─────┬─────┬─────────┘
                   ACP(stdio)  │     │     │  ACP(stdio)
                     ┌─────────▼┐ ┌──▼──┐ ┌▼──────────┐
                     │ Worker-01│ │Wk-02│ │Manager Agt │
                     │(claude)  │ │(gpt)│ │(调度顾问)   │
                     └──────────┘ └─────┘ └───────────┘
```

**核心设计理念**：任何支持 ACP 协议（JSON-RPC 2.0 over stdio）的 AI Agent 都可以作为 Worker 挂载到 Client Node 上。

---

## Part 1: 启动 Server

### 1.1 前置条件

- Node.js >= 20.0.0
- pnpm >= 9.x

### 1.2 安装与构建

```bash
pnpm install
pnpm build
```

### 1.3 零配置启动

```bash
node packages/server/dist/index.js
# Server 默认监听 0.0.0.0:9800，数据存储在 ./data/
```

### 1.4 自定义配置

**环境变量方式**（推荐用于快速测试）：

```bash
DISPATCH_SERVER_PORT=8080 \
DISPATCH_DATA_DIR=./my-data \
DISPATCH_LOG_LEVEL=debug \
DISPATCH_AUTH_ENABLED=true \
DISPATCH_AUTH_TOKENS="tok_client_abc123,tok_operator_xyz:operator" \
node packages/server/dist/index.js
```

**配置文件方式**（`server.config.json`）：

```json
{
  "host": "0.0.0.0",
  "port": 9800,
  "dataDir": "./data",
  "logLevel": "info",
  "auth": {
    "enabled": true,
    "users": [{ "username": "admin", "password": "your-password" }],
    "tokens": [
      "tok_client_abc123",
      { "token": "tok_operator_xyz", "role": "operator" }
    ]
  }
}
```

### 1.5 验证

```bash
curl http://localhost:9800/health
# {"status":"ok","version":"0.0.1","authEnabled":false}
```

### 1.6 环境变量一览

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DISPATCH_SERVER_HOST` | `0.0.0.0` | 监听地址 |
| `DISPATCH_SERVER_PORT` | `9800` | 监听端口 |
| `DISPATCH_DATA_DIR` | `./data` | 数据目录 |
| `DISPATCH_LOG_LEVEL` | `info` | 日志级别 (debug/info/warn/error) |
| `DISPATCH_AUTH_ENABLED` | `false` | 启用鉴权 |
| `DISPATCH_AUTH_TOKENS` | — | 静态 Token 列表（逗号分隔，`:role` 后缀可选） |

---

## Part 2: 配置 Client Node

### 2.1 最小可用配置

在工作目录创建 `client.config.json`：

```json
{
  "name": "my-node",
  "serverUrl": "http://localhost:9800",
  "tags": ["code-review"],
  "dispatchMode": "tag-auto",
  "autoDispatch": {
    "rules": [
      { "taskTags": ["code-review"], "targetAgentId": "worker-01", "priority": 10 }
    ],
    "fallbackAction": "skip"
  },
  "agents": [
    {
      "id": "worker-01",
      "type": "worker",
      "command": "claude-agent-acp",
      "workDir": "/path/to/workspace"
    }
  ]
}
```

### 2.2 完整配置结构

```json
{
  "name": "production-node",
  "serverUrl": "http://your-server:9800",
  "token": "tok_client_abc123",
  "tags": ["code-review", "documentation", "testing"],
  "dispatchMode": "hybrid",
  "polling": { "interval": 10000 },
  "heartbeat": { "interval": 30000 },
  "ipc": { "path": "" },
  "autoDispatch": {
    "rules": [
      { "taskTags": ["code-review"], "targetAgentId": "claude-worker", "priority": 10 },
      { "taskTags": ["documentation"], "targetCapabilities": ["writing"], "priority": 5 },
      { "taskTags": ["testing"], "targetAgentId": "test-worker", "priority": 8 }
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

### 2.3 关键字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| `name` | 是 | 节点唯一标识，Server 按此区分客户端 |
| `serverUrl` | 是 | Server HTTP 地址 |
| `token` | 启用 auth 时 | Server 分配的 API Token |
| `tags` | 是 | 节点能处理的任务标签集合 |
| `dispatchMode` | 是 | 分发策略：`tag-auto` / `manager` / `hybrid` |
| `autoDispatch.rules` | tag-auto/hybrid | 按 task tag 匹配 Worker 的规则列表 |
| `autoDispatch.fallbackAction` | 否 | 无规则匹配时行为：`skip`（默认）/ `queue-local` |

### 2.4 分发模式

| 模式 | 工作方式 | 需要 Manager |
|------|---------|:-----------:|
| `tag-auto` | 规则引擎按 task tag 匹配 Worker，按 priority 排序 | 否 |
| `manager` | 每个待分配任务都咨询 Manager Agent，由 AI 决定路由 | 是 |
| `hybrid` | Manager 在线时用 AI 调度，离线时回退到 tag-auto 规则 | 可选 |

### 2.5 分发规则详解

```json
{
  "taskTags": ["backend", "api"],
  "targetAgentId": "worker-backend",
  "targetCapabilities": ["typescript", "node"],
  "priority": 10
}
```

| 字段 | 说明 |
|------|------|
| `taskTags` | AND 逻辑 — 任务必须包含所有指定 tag 才匹配 |
| `targetAgentId` | 精确指定 Worker ID |
| `targetCapabilities` | 按能力匹配 — 选择拥有这些 capabilities 的空闲 Worker |
| `priority` | 数值越大越优先（多条规则匹配时取最高优先级） |

### 2.6 启动 Client Node

```bash
node packages/client-node/dist/main.js
# 或指定配置文件
DISPATCH_NODE_CONFIG=./my-config.json node packages/client-node/dist/main.js
```

CLI 方式：

```bash
dispatch start --config ./client.config.json
dispatch start --config ./client.config.json --foreground
```

---

## Part 3: 将 Agent 作为 Worker 挂载（重点）

这是 AgentDispatch 的核心操作——将一个 AI Agent 注册为 Worker，使其能自动接收并执行分发来的任务。

### 3.1 Agent 挂载原理

```
┌──────────────────────────────────────────────────────────────┐
│                     Client Node                               │
│                                                               │
│  1. Dispatcher 决定: task → worker-01                         │
│  2. HTTP claim → Server                                       │
│  3. AcpController.launchAgent():                              │
│     a. 创建 AgentProcess (spawn 子进程)                        │
│     b. 注入 DISPATCH_TOKEN + DISPATCH_IPC_PATH                │
│     c. 通过 stdin/stdout 建立 ACP JSON-RPC 连接               │
│     d. 发送 initialize (声明 capabilities)                     │
│     e. TaskWorkflowRunner 发送 task prompt                    │
│  4. Worker 执行任务，通过 dispatch CLI 上报进度                  │
│  5. Worker 完成 → 产物打包 → dispatch worker complete          │
│  6. AcpController 收集结果 → 上传 Server → 标记 completed      │
│                                                               │
│  ┌─────────────────┐  stdio (ACP)  ┌──────────────────┐      │
│  │  AcpController   │←────────────→│  Worker Process   │      │
│  │  DispatchAcpClient│              │  (ACP Agent 进程)  │      │
│  └─────────────────┘               └──────────────────┘      │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 AgentConfig 完整字段

每个 Worker 在 `client.config.json` 的 `agents` 数组中注册：

```typescript
interface AgentConfig {
  id: string;                    // 唯一标识（必填）
  type: 'manager' | 'worker';   // 角色（必填）
  command: string;               // 启动命令（必填）
  args?: string[];               // 额外启动参数
  workDir: string;               // 工作目录（必填）
  capabilities?: string[];       // 能力标签（用于 dispatch 匹配）
  autoClaimTags?: string[];      // 自动认领的任务标签
  allowMultiProcess?: boolean;   // 是否允许并行多任务（默认 false）
  promptTemplate?: string;       // 自定义 prompt 模板路径
  acpCapabilities?: {
    fs?: {
      readTextFile?: boolean;    // 允许 Agent 读文件
      writeTextFile?: boolean;   // 允许 Agent 写文件
    };
    terminal?: boolean;          // 允许 Agent 使用终端
  };
  permissionPolicy?: 'auto-allow' | 'auto-deny' | 'prompt';
}
```

### 3.3 关键字段深度说明

#### `command` — Agent 启动命令

第一个 token 是可执行文件，后续 token 是默认参数。`args` 中的参数会追加到末尾。

```json
{ "command": "claude-agent-acp", "args": ["--model", "sonnet"] }
// 实际执行: claude-agent-acp --model sonnet
```

**要求**：`command` 启动的进程必须通过 **stdin/stdout** 进行 ACP 协议通信（JSON-RPC 2.0, newline-delimited JSON）。stderr 用于日志输出，不参与协议。

> **注意**：并非所有 AI Agent CLI 都原生支持 ACP。部分 Agent（如 Claude、Codex）需要通过适配器。
> 详见 [ACP 兼容 Agent 列表](https://agentclientprotocol.com/get-started/agents)。

#### `workDir` — Agent 工作目录

Agent 进程以此目录为 `cwd` 启动。Client Node 会在其中创建：

```
{workDir}/
├── .dispatch/
│   ├── input/{taskIdPrefix}/    ← 下载的任务附件
│   └── output/{taskIdPrefix}/   ← Agent 应将产物放在这里
│       ├── artifact.zip         ← 产物压缩包
│       └── result.json          ← 结构化结果
└── ... (Agent 自身的文件)
```

#### `capabilities` — 能力标签

与分发规则的 `targetCapabilities` 配合使用：

```json
// 规则: 需要 ["typescript", "testing"] 能力的 Worker
{ "taskTags": ["unit-test"], "targetCapabilities": ["typescript", "testing"] }

// Worker: 声明自己具备这些能力
{ "id": "test-bot", "capabilities": ["typescript", "testing", "jest"] }
// ✓ 匹配成功（Worker 具备规则要求的所有能力）
```

#### `acpCapabilities` — ACP 能力声明

在 ACP `initialize` 阶段向 Agent 声明 Client 提供的能力：

```json
{
  "acpCapabilities": {
    "fs": { "readTextFile": true, "writeTextFile": true },
    "terminal": true
  }
}
```

| 能力 | 说明 |
|------|------|
| `fs.readTextFile` | Agent 可通过 ACP 请求读取 Client 端文件 |
| `fs.writeTextFile` | Agent 可通过 ACP 请求写入 Client 端文件 |
| `terminal` | Agent 可通过 ACP 请求执行终端命令 |

#### `permissionPolicy` — 权限策略

当 Agent 通过 ACP 请求使用工具（文件读写、终端）时的审批策略：

| 值 | 行为 |
|----|------|
| `auto-allow` | 自动批准所有请求（默认，适合可信 Agent） |
| `auto-deny` | 自动拒绝所有请求（最安全） |
| `prompt` | 需要人工审批（当前未完整实现） |

### 3.4 Worker 生命周期

```
                          Client Node 启动
                               │
                    Worker 注册 (config.agents)
                               │
                          status: idle
                               │
              ┌────────────────▼────────────────┐
              │   Dispatcher 匹配到合适的任务     │
              │   HTTP claim → Server             │
              └────────────────┬────────────────┘
                               │
              ┌────────────────▼────────────────┐
              │   AcpController.launchAgent()    │
              │   1. spawn(command, {cwd:workDir})│
              │   2. env += DISPATCH_TOKEN        │
              │   3. env += DISPATCH_IPC_PATH     │
              │   4. ACP initialize()             │
              │   5. ACP prompt(taskContent)       │
              └────────────────┬────────────────┘
                               │
                        status: busy
                               │
              ┌────────────────▼────────────────┐
              │  Worker 执行任务                   │
              │  - dispatch worker progress ...   │
              │  - dispatch worker log ...        │
              │  - 产出 artifact.zip + result.json │
              │  - dispatch worker complete ...   │
              └────────────────┬────────────────┘
                               │
                   ┌───────────┴───────────┐
                   ▼                       ▼
            完成 (completed)         失败 (failed)
                   │                       │
            status: idle             auto restart?
                   │                  (指数退避)
                   ▼                       │
            等待下一个任务              status: idle
```

#### 进程环境变量注入

Worker 进程启动时自动获得两个关键环境变量：

| 变量 | 值 | 用途 |
|------|-----|------|
| `DISPATCH_TOKEN` | `wt_<uuid>` | 临时 Worker Token，仅在本次任务生命周期内有效，任务结束自动撤销 |
| `DISPATCH_IPC_PATH` | Unix socket / named pipe 路径 | 连接 Client Node IPC Server，用于 `dispatch` CLI 通信 |

#### 自动重启机制

Worker 进程异常退出时（exit code ≠ 0）：

1. 状态标记为 `crashed`
2. 如有正在执行的任务，自动释放回 `pending`
3. 如重启次数未超限（默认 3 次），启用指数退避重启：
   - 第 1 次: 2 秒后
   - 第 2 次: 4 秒后
   - 第 3 次: 8 秒后（上限 30 秒）
4. 重启后状态回到 `idle`，可继续接收新任务

### 3.5 Worker 通过 CLI 与系统交互

Worker 在任务执行过程中使用 `dispatch` CLI：

```bash
# 上报进度（首次上报触发 claimed → in_progress 转换）
dispatch worker progress <taskId> --percent 30 --message "分析代码中..."

# 追加工作日志
dispatch worker log <taskId> --message "发现 3 个潜在安全问题"

# 完成任务（提交产物）
dispatch worker complete <taskId> \
  --zip ./output/artifact.zip \
  --result ./output/result.json

# 报告失败
dispatch worker fail <taskId> --reason "无法访问代码仓库"

# 查询当前任务状态
dispatch worker status <taskId>

# 心跳（长时间无进度更新时使用）
dispatch worker heartbeat <taskId>
```

### 3.6 ACP 任务分发流程

Client Node 通过 ACP 向 Worker 发送任务时，使用 **TaskWorkflowRunner** 执行多轮对话：

**Pass 1: InitialTaskPass** — 构建任务 prompt，包含：
- 任务标题、描述、优先级、标签、元数据
- 附件路径（如有下载）
- 产物输出目录和格式要求
- CLI 命令参考

**Pass 2: ArtifactEnforcementPass** — 任务完成后检查产物：
- 验证 `artifact.zip` 和 `result.json` 是否存在
- 如产物缺失，向 Agent 发送补救 prompt，要求补充
- 最终验证通过后才标记任务完成

---

## Part 4: 挂载不同类型的 Agent

> **前提**：并非所有 AI Agent CLI 都原生支持 ACP 协议。部分需要通过**适配器**桥接。
> 完整列表参见 [ACP 兼容 Agent](https://agentclientprotocol.com/get-started/agents)。

### 4.0 ACP 兼容 Agent 参考表

| Agent | ACP 支持 | command | args | 安装方式 |
|-------|---------|---------|------|---------|
| **Claude Agent** | 适配器 | `claude-agent-acp` | — | `npm i -g @zed-industries/claude-agent-acp` |
| **Codex CLI** | 适配器 | `codex-acp` | — | `npm i -g @zed-industries/codex-acp` |
| **Gemini CLI** | 原生 | `gemini` | `["--experimental-acp"]` | `npm i -g @google/gemini-cli` |
| **Goose** | 原生 | `goose` | `["acp"]` | [block.github.io/goose](https://block.github.io/goose/docs/guides/acp-clients) |
| **OpenCode** | 原生 | `opencode` | `["acp"]` | [open-code.ai](https://open-code.ai/docs/en/acp) |
| **Kiro CLI** | 原生 | `kiro` | — | [kiro.dev/cli](https://kiro.dev/cli/) |
| **Kimi CLI** | 原生 | `kimi` | — | [github.com/MoonshotAI/kimi-cli](https://github.com/MoonshotAI/kimi-cli) |
| **Augment Code** | 原生 | `augment` | — | [docs.augmentcode.com/cli/acp](https://docs.augmentcode.com/cli/acp) |
| **Cline** | 原生 | `cline` | — | [cline.bot](https://cline.bot/) |
| **Qwen Code** | 原生 | `qwen-code` | — | [github.com/QwenLM/qwen-code](https://github.com/QwenLM/qwen-code) |
| **Mistral Vibe** | 原生 | `mistral-vibe` | — | [github.com/mistralai/mistral-vibe](https://github.com/mistralai/mistral-vibe) |
| **OpenHands** | 原生 | — | — | [docs.openhands.dev](https://docs.openhands.dev/openhands/usage/run-openhands/acp) |
| **GitHub Copilot** | 公测 | — | — | [github.com/features/copilot](https://github.com/features/copilot) |
| **Pi** | 适配器 | `pi-acp` | — | [github.com/svkozak/pi-acp](https://github.com/svkozak/pi-acp) |
| 自定义 Agent | 需自行实现 | `node ./agent.mjs` | — | 使用 ACP SDK（TypeScript/Python/Rust/Kotlin） |

> **重要**：很多 Agent CLI 的"普通模式"是交互式终端，不等于 ACP 模式。必须使用上表中对应的 `args` 参数才能进入 ACP stdio 通信模式。

ACP SDK 库：
- TypeScript: `@anthropic-ai/agent-client-protocol` — [文档](https://agentclientprotocol.com/libraries/typescript)
- Python: `agent-client-protocol` — [文档](https://agentclientprotocol.com/libraries/python)
- Rust: — [文档](https://agentclientprotocol.com/libraries/rust)
- Kotlin: — [文档](https://agentclientprotocol.com/libraries/kotlin)

### 4.1 挂载 Claude Agent

Claude Code **不原生支持 ACP**，需通过 Zed 官方的 [`claude-agent-acp`](https://github.com/zed-industries/claude-agent-acp) 适配器桥接。

**安装适配器**：

```bash
npm install -g @zed-industries/claude-agent-acp
```

**配置**：

```json
{
  "agents": [
    {
      "id": "claude-reviewer",
      "type": "worker",
      "command": "claude-agent-acp",
      "args": ["--model", "sonnet"],
      "workDir": "/workspace/claude-reviewer",
      "capabilities": ["code-review", "security-audit", "typescript"],
      "acpCapabilities": {
        "fs": { "readTextFile": true, "writeTextFile": true },
        "terminal": true
      },
      "permissionPolicy": "auto-allow"
    }
  ]
}
```

> 适配器通过 Claude Agent SDK 调用 Claude，需要设置 `ANTHROPIC_API_KEY` 环境变量。
> 也可下载[预编译二进制](https://github.com/zed-industries/claude-agent-acp/releases)，无需 Node.js。

### 4.2 挂载 Codex Agent

OpenAI Codex CLI 同样需通过 [`codex-acp`](https://github.com/zed-industries/codex-acp) 适配器：

```bash
npm install -g @zed-industries/codex-acp
```

```json
{
  "agents": [
    {
      "id": "codex-worker",
      "type": "worker",
      "command": "codex-acp",
      "workDir": "/workspace/codex-worker",
      "capabilities": ["code-generation", "refactor"],
      "permissionPolicy": "auto-allow"
    }
  ]
}
```

> 需要设置 `OPENAI_API_KEY` 或 `CODEX_API_KEY` 环境变量。

### 4.3 挂载原生 ACP Agent（Gemini、Goose、OpenCode 等）

部分 Agent CLI 内置 ACP 协议支持，但通常需要特定的子命令或标志才能进入 ACP 模式（而非交互终端模式）。

**Gemini CLI**（需 `--experimental-acp` 标志）：

```json
{
  "agents": [
    {
      "id": "gemini-worker",
      "type": "worker",
      "command": "gemini",
      "args": ["--experimental-acp"],
      "workDir": "/workspace/gemini-worker",
      "capabilities": ["code-generation", "analysis"],
      "permissionPolicy": "auto-allow"
    }
  ]
}
```

**Goose**（需 `acp` 子命令）：

```json
{
  "agents": [
    {
      "id": "goose-worker",
      "type": "worker",
      "command": "goose",
      "args": ["acp"],
      "workDir": "/workspace/goose-worker",
      "capabilities": ["general"],
      "permissionPolicy": "auto-allow"
    }
  ]
}
```

**OpenCode**（需 `acp` 子命令）：

```json
{
  "agents": [
    {
      "id": "opencode-worker",
      "type": "worker",
      "command": "opencode",
      "args": ["acp"],
      "workDir": "/workspace/opencode-worker",
      "capabilities": ["code-generation", "refactor"]
    }
  ]
}
```

### 4.4 挂载自定义 ACP Agent

任何实现了 ACP 协议的程序都可以作为 Worker。ACP 协议要求：

- 通过 **stdin** 接收 JSON-RPC 2.0 消息（换行分隔 NDJSON）
- 通过 **stdout** 发送 JSON-RPC 2.0 响应（换行分隔 NDJSON）
- stderr 用于日志（不参与协议通信）

**Python ACP Agent 示例**：

```json
{
  "agents": [
    {
      "id": "python-analyzer",
      "type": "worker",
      "command": "python",
      "args": ["./my_agent.py"],
      "workDir": "/workspace/python-agent",
      "capabilities": ["data-analysis", "python"],
      "acpCapabilities": {
        "fs": { "readTextFile": true }
      }
    }
  ]
}
```

**Node.js ACP Agent**：

```json
{
  "agents": [
    {
      "id": "node-agent",
      "type": "worker",
      "command": "node",
      "args": ["./agent.mjs"],
      "workDir": "/workspace/node-agent",
      "capabilities": ["web-scraping", "api-testing"]
    }
  ]
}
```

### 4.5 挂载 Manager Agent（调度顾问）

Manager Agent 不执行任务，而是为 Client Node 提供分发建议：

```json
{
  "dispatchMode": "manager",
  "agents": [
    {
      "id": "dispatch-manager",
      "type": "manager",
      "command": "claude-agent-acp",
      "workDir": "/workspace/manager",
      "acpCapabilities": {
        "fs": { "readTextFile": true, "writeTextFile": false },
        "terminal": false
      }
    },
    {
      "id": "worker-backend",
      "type": "worker",
      "command": "claude-agent-acp",
      "workDir": "/workspace/backend",
      "capabilities": ["backend", "api", "database"]
    },
    {
      "id": "worker-frontend",
      "type": "worker",
      "command": "gemini",
      "args": ["--experimental-acp"],
      "workDir": "/workspace/frontend",
      "capabilities": ["frontend", "react", "css"]
    }
  ]
}
```

Manager 收到的咨询 prompt 包含：任务信息 + 所有可用 Worker 的 ID、能力和状态。Manager 返回 JSON 格式的 `DispatchAdvice`：

```json
{
  "recommendedAgentId": "worker-backend",
  "confidence": 0.9,
  "reason": "This task involves API endpoint implementation, best suited for the backend worker."
}
```

### 4.6 多 Worker 集群配置

一个 Client Node 可以挂载多个 Worker，形成专业化分工。不同 Worker 可以使用不同的 Agent：

```json
{
  "name": "team-alpha",
  "serverUrl": "http://dispatch-server:9800",
  "token": "tok_team_alpha",
  "tags": ["code-review", "testing", "docs", "refactor"],
  "dispatchMode": "hybrid",
  "autoDispatch": {
    "rules": [
      { "taskTags": ["code-review"], "targetAgentId": "reviewer", "priority": 10 },
      { "taskTags": ["testing"], "targetAgentId": "tester", "priority": 10 },
      { "taskTags": ["docs"], "targetAgentId": "writer", "priority": 5 },
      { "taskTags": ["refactor"], "targetCapabilities": ["typescript"], "priority": 8 }
    ],
    "fallbackAction": "skip"
  },
  "agents": [
    {
      "id": "manager",
      "type": "manager",
      "command": "claude-agent-acp",
      "workDir": "/workspace/manager"
    },
    {
      "id": "reviewer",
      "type": "worker",
      "command": "claude-agent-acp",
      "workDir": "/workspace/reviewer",
      "capabilities": ["code-review", "security", "typescript", "python"]
    },
    {
      "id": "tester",
      "type": "worker",
      "command": "gemini",
      "args": ["--experimental-acp"],
      "workDir": "/workspace/tester",
      "capabilities": ["testing", "typescript", "jest", "playwright"]
    },
    {
      "id": "writer",
      "type": "worker",
      "command": "goose",
      "args": ["acp"],
      "workDir": "/workspace/writer",
      "capabilities": ["writing", "documentation", "markdown"]
    }
  ]
}
```

### 4.7 Worker 挂载检查清单

挂载新 Worker 前确认以下事项：

| 检查项 | 说明 |
|--------|------|
| Agent 支持 ACP 协议 | 原生支持或已安装适配器（参见 4.0 参考表） |
| `command` 可直接执行 | 在 shell 中运行 `command` 能成功启动（已 `npm i -g` 或在 PATH 中） |
| API Key 已配置 | 如 `ANTHROPIC_API_KEY`、`OPENAI_API_KEY` 等环境变量已设置 |
| `workDir` 存在且有写权限 | Client Node 需要在其中创建 `.dispatch/` 目录 |
| `id` 全局唯一 | 同一 Client Node 下所有 Agent ID 不能重复 |
| `capabilities` 与规则匹配 | 至少有一条 `autoDispatch.rules` 能路由到此 Worker |
| 网络可达 | Worker 能通过 IPC 路径连接 Client Node |

---

## Part 5: 提交任务并监听状态

### 5.1 创建任务

**JSON 请求**：

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

**带附件（multipart）**：

```bash
curl -X POST http://localhost:9800/api/v1/tasks \
  -H "Authorization: Bearer tok_client_abc123" \
  -F 'data={"title":"Analyze dataset","tags":["data-analysis"],"priority":"normal"}' \
  -F 'files=@./dataset.csv' \
  -F 'files=@./config.yaml'
```

### 5.2 查询任务

```bash
curl http://localhost:9800/api/v1/tasks                  # 所有活跃任务
curl "http://localhost:9800/api/v1/tasks?status=pending"  # 按状态
curl "http://localhost:9800/api/v1/tasks?tag=code-review" # 按标签
curl "http://localhost:9800/api/v1/tasks?page=1&limit=10" # 分页
curl http://localhost:9800/api/v1/tasks/{taskId}          # 单个任务
```

### 5.3 SSE 流式监听（推荐）

```bash
curl -N "http://localhost:9800/api/v1/tasks/{taskId}/stream?interval=1000&logs=true"
```

| 事件 | 说明 | 数据 |
|------|------|------|
| `task` | 状态/进度变化 | `{ id, status, progress, progressMessage, claimedBy, updatedAt }` |
| `logs` | 新交互日志 | `InteractionLogEntry[]` |
| `done` | 到达终态 | `{ taskId, finalStatus }` |
| `error` | 轮询出错 | `{ message }` |

**TypeScript 示例**：

```typescript
function watchTask(serverUrl: string, taskId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = `${serverUrl}/api/v1/tasks/${taskId}/stream?interval=1000&logs=true`;
    const es = new EventSource(url);

    es.addEventListener('task', (e) => {
      const data = JSON.parse(e.data);
      console.log(`[${data.status}] ${data.progressMessage ?? ''}`);
    });

    es.addEventListener('logs', (e) => {
      for (const entry of JSON.parse(e.data)) {
        console.log(`  [${entry.type}] ${entry.content.slice(0, 80)}`);
      }
    });

    es.addEventListener('done', (e) => {
      const data = JSON.parse(e.data);
      es.close();
      resolve(data.finalStatus);
    });

    es.addEventListener('error', () => { es.close(); reject(new Error('SSE error')); });
  });
}
```

---

## Part 6: 任务状态机

```
pending ──→ claimed ──→ in_progress ──→ completed
   │                        │
   │                        └──→ failed ──→ (release) ──→ pending
   │
   └──→ cancelled
```

| 状态 | 触发 | 说明 |
|------|------|------|
| `pending` | 创建任务 / release | 等待被领取 |
| `claimed` | Worker claim | 已分配给 Worker，尚未开始 |
| `in_progress` | 首次 progress 上报 | 正在执行中 |
| `completed` | 产物上传成功 | 终态 |
| `failed` | Worker 报告失败 | 可通过 release 回到 pending |
| `cancelled` | 手动取消 | 终态 |

---

## Part 7: Token 鉴权

| 角色 | 用途 | 权限 |
|------|------|------|
| `admin` | Dashboard 登录 | 完全权限 |
| `client` | Client Node / Worker | 完全权限（包括 claim/complete） |
| `operator` | 外部集成 | 创建/删除/查看任务；**禁止** claim/release/progress/complete/cancel |

```bash
# 登录获取 session token
curl -X POST http://localhost:9800/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your-password"}'

# 使用 static token
curl -H "Authorization: Bearer tok_client_abc123" http://localhost:9800/api/v1/tasks
```

---

## Part 8: 端到端示例

### 8.1 最简单的完整流程

```bash
#!/bin/bash
# 1. 启动 Server
DISPATCH_DATA_DIR=/tmp/dispatch-demo node packages/server/dist/index.js &
sleep 2

# 2. 提交任务
TASK_ID=$(curl -s -X POST http://localhost:9800/api/v1/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"Demo","tags":["demo"],"priority":"normal"}' | jq -r '.id')
echo "Task: $TASK_ID"

# 3. 监听（后台）
curl -sN "http://localhost:9800/api/v1/tasks/$TASK_ID/stream?interval=1000" &

# 4. 模拟 Worker: claim → progress → complete
curl -s -X POST "http://localhost:9800/api/v1/tasks/$TASK_ID/claim" \
  -H "Content-Type: application/json" -d '{"clientId":"node-01","agentId":"worker-01"}'

curl -s -X POST "http://localhost:9800/api/v1/tasks/$TASK_ID/progress" \
  -H "Content-Type: application/json" \
  -d '{"clientId":"node-01","agentId":"worker-01","progress":50,"message":"Working..."}'

# 5. 清理
kill %2 2>/dev/null; kill %1 2>/dev/null
```

### 8.2 单 Worker 自动化完整部署

```bash
#!/bin/bash
# 1. 启动 Server
DISPATCH_DATA_DIR=./data node packages/server/dist/index.js &
sleep 2

# 2. 安装 ACP 适配器（以 Claude 为例；若用 Gemini 等原生 ACP Agent 可跳过）
npm install -g @zed-industries/claude-agent-acp

# 3. 准备 Worker 工作目录
mkdir -p /workspace/claude-worker

# 4. 创建 client.config.json
cat > client.config.json <<EOF
{
  "name": "single-worker-node",
  "serverUrl": "http://localhost:9800",
  "tags": ["general"],
  "dispatchMode": "tag-auto",
  "autoDispatch": {
    "rules": [{ "taskTags": ["general"], "targetAgentId": "claude", "priority": 1 }]
  },
  "agents": [{
    "id": "claude",
    "type": "worker",
    "command": "claude-agent-acp",
    "workDir": "/workspace/claude-worker",
    "capabilities": ["general"],
    "acpCapabilities": { "fs": { "readTextFile": true, "writeTextFile": true }, "terminal": true },
    "permissionPolicy": "auto-allow"
  }]
}
EOF

# 5. 启动 Client Node（Worker 自动就绪）
node packages/client-node/dist/main.js &
sleep 3

# 6. 提交任务 → Worker 自动领取并执行
curl -X POST http://localhost:9800/api/v1/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"Write unit tests for auth module","tags":["general"],"priority":"normal"}'

echo "Task submitted. Worker will pick it up automatically."
```

---

## REST API 快速参考

### 任务管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/v1/tasks` | 创建任务 |
| `GET` | `/api/v1/tasks` | 列出活跃任务（?status=&tag=&page=&limit=） |
| `GET` | `/api/v1/tasks/:id` | 获取单个任务 |
| `PATCH` | `/api/v1/tasks/:id` | 更新任务 |
| `DELETE` | `/api/v1/tasks/:id` | 删除任务 |
| `POST` | `/api/v1/tasks/:id/claim` | 领取任务 |
| `POST` | `/api/v1/tasks/:id/release` | 释放任务 |
| `POST` | `/api/v1/tasks/:id/progress` | 上报进度 |
| `POST` | `/api/v1/tasks/:id/complete` | 完成任务（multipart） |
| `POST` | `/api/v1/tasks/:id/cancel` | 取消任务 |
| `GET` | `/api/v1/tasks/:id/stream` | SSE 流式监听 |
| `GET/POST` | `/api/v1/tasks/:id/logs` | 交互日志 |

### 客户端管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/v1/clients/register` | 注册 |
| `GET` | `/api/v1/clients` | 列表 |
| `GET` | `/api/v1/clients/:id` | 详情 |
| `DELETE` | `/api/v1/clients/:id` | 注销 |
| `POST` | `/api/v1/clients/:id/heartbeat` | 心跳 |

### 鉴权

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/v1/auth/login` | 登录 |
| `POST` | `/api/v1/auth/logout` | 登出 |
| `GET` | `/api/v1/auth/me` | 验证 Token |
| `GET` | `/health` | 健康检查（无需鉴权） |

---

## 常见错误码

| 错误码 | HTTP | 说明 |
|--------|------|------|
| `TASK_NOT_FOUND` | 404 | 任务不存在 |
| `TASK_ALREADY_CLAIMED` | 409 | 任务已被其他 Worker 领取，或非 owner 操作 |
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
└── logs/
    ├── tasks/       # 按任务 ID 的交互日志 (.jsonl)
    ├── clients/     # 按客户端 ID 的日志
    └── server-*.jsonl  # Server 主日志
```
