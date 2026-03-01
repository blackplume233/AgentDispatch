# Configuration Specification — AgentDispatch

> Document all configuration fields, environment variables, and schemas here.

> **⚠️ 变更控制 (CRITICAL)**
>
> 配置 Schema 是各模块读取/解析配置的**刚性约定**。字段增删、类型变更、默认值修改都属于契约变更。
>
> **变更流程**：
> 1. 评估影响范围 → 哪些模块解析了该字段
> 2. 在本文档中修改并标注 `[BREAKING]` / `[CHANGED]` / `[DEPRECATED]` + 日期
> 3. 如涉及 API 请求/响应结构 → 同步更新 `api-contracts.md`
> 4. 更新相关测试用例和校验逻辑
>
> **禁止**：在代码中直接新增/修改配置字段而不更新本文档。

### Change Log

| 日期 | 变更 | 类型 | 影响范围 |
|------|------|------|----------|
| 2026-02-28 | AgentConfig.workDir 语义明确：ACP session cwd 始终为 Agent 注册的 workDir（保留 Agent 上下文/skills）；产物输出到隔离子目录 `{workDir}/.dispatch/output/{taskId-prefix}/`；进度汇报改为纯状态描述 | [CHANGED] | ClientNode |
| 2026-03-01 | ServerConfig 新增 `archive` 配置段（checkInterval/archiveAfterDays/cacheMaxAge）；新增 `DISPATCH_ARCHIVE_*` 环境变量；数据目录新增 `tasks-archive/` 归档存储 | [CHANGED] | Server |
| 2026-03-01 | ServerConfig 新增 `attachments` 配置段；Server 数据目录新增 `attachments/{task-id}/` 存储结构；ClientNode 新增 `{workDir}/.dispatch/input/{taskId-prefix}/` 输入目录 | [CHANGED] | Server, ClientNode |
| 2026-02-28 | ServerConfig 新增 `artifacts` 配置段；Server 数据目录新增 `artifacts/{task-id}/` 存储结构 | [CHANGED] | Server |
| 2026-02-28 | ClientConfig 新增 `dispatchMode` 字段；Manager Agent 从必须改为按模式可选；DispatchRule 新增 `priority`；autoDispatch 新增 `fallbackAction` | [CHANGED] | ClientNode, Server, Dashboard |
| 2026-03-01 | AgentConfig.command 新增 Common Mistake 警告：裸命令启动交互终端而非 ACP 模式；全部 14 个 Agent 命令经逐一核实修正 | [CHANGED] | ClientNode, Docs |
| 2026-03-01 | AgentConfig.command 示例修正：Claude 需通过 `claude-agent-acp` 适配器、Codex 需通过 `codex-acp` 适配器；新增 ACP 兼容 Agent 完整列表引用 | [CHANGED] | ClientNode, Docs |
| 2026-03-01 | Dashboard 远程访问配置：新增 `VITE_DASHBOARD_HOST`/`VITE_DASHBOARD_PORT`/`VITE_API_URL` 环境变量；Vite proxy 新增 `/health` 转发；Server 启动时 host 为全接口且 auth 未启用时输出安全警告 | [CHANGED] | Dashboard, Server |
| 2026-03-01 | AgentConfig 新增 `env` 可选字段：允许在配置中声明注入子进程的环境变量（如 API Key、模型端点），优先级：process.env < agentConfig.env < 系统注入的 DISPATCH_* | [CHANGED] | ClientNode |
| 2026-02-28 | AgentConfig 明确 ACP SDK 集成字段；新增 `acpCapabilities` 配置段；`command` 字段说明更新为 ACP Agent 启动命令 | [CHANGED] | ClientNode |
| 2026-03-01 | auth.tokens 支持角色：`string` 默认 client 角色，`{ token, role }` 指定角色（admin/client/operator）；operator 角色禁止 claim/release/progress/complete/cancel/patch 等 worker 操作；新增 `FORBIDDEN` 错误码 (403) | [CHANGED] | Server |
| 2026-03-01 | ServerConfig 新增 `auth` 配置段（enabled/users/tokens/sessionTtl）；新增 `DISPATCH_AUTH_ENABLED` 环境变量；ClientConfig 新增 `token` 可选字段；新增 auth 路由（login/logout/me）；Server 增加 Fastify onRequest auth hook | [CHANGED] | Server, ClientNode, Dashboard |
| 2026-03-01 | 新增 `DISPATCH_TOKEN`、`DISPATCH_IPC_PATH` 环境变量；Worker 临时 Token 由 ClientNode 签发并注入子进程环境 | [CHANGED] | ClientNode, CLI |
| 2026-02-28 | 初始化全部配置定义 | NEW | 全部模块 |

---

## 1. Environment Variables

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `DISPATCH_SERVER_HOST` | string | `0.0.0.0` | Server 监听地址 |
| `DISPATCH_SERVER_PORT` | number | `9800` | Server 监听端口 |
| `DISPATCH_DATA_DIR` | string | `./data` | Server 数据存储目录 |
| `DISPATCH_LOG_LEVEL` | string | `info` | 日志级别: debug/info/warn/error |
| `DISPATCH_QUEUE_MAX_SIZE` | number | `1000` | 操作队列最大长度 |
| `DISPATCH_HEARTBEAT_TIMEOUT` | number | `60000` | 心跳超时（ms），超时判定 Client 离线 |
| `DISPATCH_CLIENT_IPC_PATH` | string | 平台相关（见下方） | ClientNode IPC 管道/socket 路径 |
| `DISPATCH_ARCHIVE_CHECK_INTERVAL` | number | `3600000` | 归档调度器检查间隔（ms） |
| `DISPATCH_ARCHIVE_AFTER_DAYS` | number | `1` | 终态任务隔 N 天后归档（0=立即） |
| `DISPATCH_ARCHIVE_CACHE_MAX_AGE` | number | `3600000` | 归档详情 TTL 缓存时长（ms） |
| `DISPATCH_AUTH_ENABLED` | string | `false` | 是否启用 Token 鉴权（"true"/"false"） |
| `DISPATCH_AUTH_TOKENS` | string | — | [NEW 2026-03-01] 逗号分隔的静态 Token 列表；可附加 `:role` 后缀指定角色（admin/client/operator），无后缀默认 client。例：`tok_abc,tok_op:operator`。与配置文件 `auth.tokens` 合并（环境变量追加在后，重复 token 后者覆盖角色） |
| `DISPATCH_TOKEN` | string | — | [NEW 2026-03-01] CLI/Worker 鉴权 Token；CLI 通过此变量或 `--token` 传递；ClientNode 为 Worker 子进程自动注入临时 Token |
| `DISPATCH_IPC_PATH` | string | — | [NEW 2026-03-01] ClientNode 为 Worker 子进程注入的 IPC socket/pipe 路径，Worker 通过此变量连接 CLI → IPC |
| `VITE_DASHBOARD_HOST` | string | `false` (localhost) | [NEW 2026-03-01] Dashboard dev server 监听地址。设为 `true` / `0.0.0.0` / `::` 监听全部接口（局域网访问）。**暴露时必须配置 auth** |
| `VITE_DASHBOARD_PORT` | number | `3000` | [NEW 2026-03-01] Dashboard dev server 监听端口 |
| `VITE_API_URL` | string | `http://localhost:9800` | [NEW 2026-03-01] Dashboard 代理的 Server API 地址。局域网部署时应设为 Server 的局域网 IP |

**IPC 路径平台默认值** [CHANGED 2026-02-28]：

| 平台 | 默认值 | 说明 |
|------|--------|------|
| Windows | `\\.\pipe\dispatch-{name}` | Named Pipe |
| Linux | `{XDG_RUNTIME_DIR}/dispatch-{name}.sock`，fallback `{tmpdir}/dispatch-{uid}/dispatch-{name}.sock` | Unix Domain Socket |
| macOS | `{tmpdir}/dispatch-{uid}/dispatch-{name}.sock` | Unix Domain Socket |

---

## 2. Server Configuration

文件路径：`server.config.json` (项目根目录或 `DISPATCH_CONFIG_PATH`)

```typescript
interface ServerConfig {
  host: string;                    // 监听地址
  port: number;                    // 监听端口
  dataDir: string;                 // 数据存储目录（Markdown/JSON 文件）
  logLevel: 'debug' | 'info' | 'warn' | 'error';

  queue: {
    maxSize: number;               // 操作队列上限
    processInterval: number;       // 队列处理间隔（ms）
  };

  heartbeat: {
    timeout: number;               // Client 心跳超时（ms）
    checkInterval: number;         // 心跳检查间隔（ms）
  };

  callbacks: {
    retryCount: number;            // 关闭回调重试次数
    retryDelay: number;            // 重试间隔（ms）
  };

  // [CHANGED 2026-03-01] 任务附件配置
  attachments: {
    dir: string;                   // 附件存储目录，默认 {dataDir}/attachments
    maxFileSizeBytes: number;      // 单文件最大大小，默认 50MB
    maxTotalSizeBytes: number;     // 单任务总附件上限，默认 200MB
    maxFileCount: number;          // 单任务最大文件数，默认 20
  };

  // [CHANGED 2026-02-28] 任务产物配置
  artifacts: {
    dir: string;                   // 产物存储目录，默认 {dataDir}/artifacts
    maxZipSizeBytes: number;       // 单个 zip 最大大小，默认 500MB
    validateOnUpload: boolean;     // 上传时立即校验，默认 true
    retainAfterDays: number;       // 已完成任务产物保留天数，默认 90
  };

  logging: {
    dir: string;                   // 日志目录，默认 {dataDir}/logs
    rotateDaily: boolean;          // 按天轮转，默认 true
    retainDays: number;            // 日志保留天数，默认 30
    httpLog: boolean;              // 记录所有 HTTP 请求/响应，默认 true
    auditLog: boolean;             // 记录所有任务/Client 操作，默认 true
  };

  // [CHANGED 2026-03-01] 任务归档与内存管理
  archive: {
    checkInterval: number;         // 归档检查间隔（ms），默认 3600000（1h）
    archiveAfterDays: number;      // 终态任务隔 N 天归档，默认 1
    cacheMaxAge: number;           // 归档详情 TTL 缓存（ms），默认 3600000（1h）
  };

  // [CHANGED 2026-03-01] Token 鉴权
  auth: {
    enabled: boolean;              // 是否启用鉴权，默认 false（关闭时所有请求放行）
    users: Array<{                 // Dashboard 登录用户列表
      username: string;
      password: string;            // 明文密码（简易版）
    }>;
    tokens: Array<                 // 静态 API Token 列表，支持两种格式
      | string                     //   纯字符串 → 默认 client 角色（完全权限）
      | {
          token: string;
          role?: 'admin' | 'client' | 'operator';  // 默认 'client'
        }
    >;
    sessionTtl: number;            // Session 过期时间（ms），默认 86400000（24h）
  };
}
```

### Server 数据目录结构

```
{dataDir}/
├── tasks/
│   ├── {task-id}.md               # 任务详情（Markdown）
│   └── {task-id}.json             # 任务元数据
├── attachments/                   # [CHANGED 2026-03-01] 任务输入附件
│   └── {task-id}/
│       ├── requirements.pdf       # 用户上传的附件文件
│       └── dataset.csv
├── tasks-archive/                 # [CHANGED 2026-03-01] 归档任务
│   ├── index.json                 # 归档索引（TaskSummary[]）
│   ├── {task-id}.json             # 归档任务元数据
│   └── {task-id}.md               # 归档任务详情
├── artifacts/                     # ⚠️ [CHANGED 2026-02-28] 任务产物（必须）
│   └── {task-id}/
│       ├── artifact.zip           # 工作成果 zip 包
│       └── result.json            # 结构化结果描述
├── clients/
│   └── {client-id}.json           # Client 注册信息
└── logs/                          # ⚠️ 全量操作日志（必须）
    ├── server-{date}.jsonl        # 主日志
    ├── http-{date}.jsonl          # 所有 HTTP 请求/响应
    └── audit-{date}.jsonl         # 任务/Client 操作审计
```

---

## 3. Client Configuration

文件路径：`client.config.json` (ClientNode 工作目录)

```typescript
interface ClientConfig {
  name: string;                    // Client 名称（唯一标识）
  serverUrl: string;               // Server 地址
  token?: string;                  // [CHANGED 2026-03-01] 可选 API Token，启用鉴权时必填
  tags: string[];                  // Client 能力标签

  // [CHANGED 2026-02-28] 任务分发模式
  // 'manager':  由 Manager Agent 智能决策（需注册 manager 类型 Agent）
  // 'tag-auto': 程序根据 tag 规则自动分发（无需 Manager Agent）
  // 'hybrid':   Manager + tag 规则共存，Manager 优先，规则兜底
  dispatchMode: 'manager' | 'tag-auto' | 'hybrid';

  polling: {
    interval: number;              // 任务列表轮询间隔（ms），默认 10000
  };

  ipc: {
    path: string;                  // IPC socket/pipe 路径（平台自适应，见 § 环境变量表）
  };

  heartbeat: {
    interval: number;              // 心跳上报间隔（ms），默认 30000
  };

  autoDispatch: {                  // tag 自动分发规则（tag-auto / hybrid 模式必填）
    rules: DispatchRule[];
    fallbackAction?: 'skip' | 'queue-local';  // 无匹配规则时的行为
  };

  logging: {
    dir: string;                   // 日志目录，默认 {workDir}/logs
    rotateDaily: boolean;          // 按天轮转，默认 true
    retainDays: number;            // 日志保留天数，默认 30
    httpLog: boolean;              // 记录所有出站 HTTP 调用，默认 true
    auditLog: boolean;             // 记录所有任务/Agent 操作，默认 true
    agentLog: boolean;             // 记录 AI Agent 交互，默认 true
  };

  agents: AgentConfig[];           // 注册的 Agent 列表
}

interface DispatchRule {
  taskTags: string[];              // 匹配的任务 tag（AND 逻辑）
  targetAgentId?: string;          // 指定 Agent
  targetCapabilities?: string[];   // 或按 Agent 能力匹配
  priority?: number;               // 规则优先级（越大越先匹配），默认 0
}
```

### 分发模式详解

| 模式 | Manager Agent | autoDispatch.rules | 适用场景 |
|------|:------------:|:------------------:|----------|
| `manager` | **必须** | 可选（Manager 参考） | 需要 AI 智能调度、复杂分发策略 |
| `tag-auto` | **不需要** | **必须** | 简单规则匹配、无需 AI 介入 |
| `hybrid` | **可选** | **必须** | Manager 做复杂决策，规则兜底简单任务 |

**tag-auto 模式工作流**：
1. ClientNode 轮询 Server 获取 pending 任务
2. 遍历 `autoDispatch.rules`，按 `priority` 降序匹配
3. 匹配到规则 → 找到空闲的目标 Worker → 自动申领并分发
4. 无匹配 → 执行 `fallbackAction`（skip: 跳过 / queue-local: 本地排队等待）

---

## 4. Agent Configuration

Agent 作为 ClientConfig 的一部分注册。

```typescript
interface AgentConfig {
  id: string;                      // Agent 唯一 ID
  type: 'manager' | 'worker';     // 角色类型

  // ACP 进程配置 [CHANGED 2026-03-01]
  // command 是 ACP Agent 子进程的启动命令，通过 child_process.spawn 执行
  // Agent 必须支持 ACP 协议 (JSON-RPC 2.0 over stdin/stdout ndjson)
  // 参考 ACP 兼容 Agent 列表: https://agentclientprotocol.com/get-started/agents
  //
  // 示例（原生 ACP，需特定子命令/标志才能进入 ACP stdio 模式）:
  //   "gemini"    + args: ["--experimental-acp"]  — Gemini CLI
  //   "goose"     + args: ["acp"]                 — Goose
  //   "opencode"  + args: ["acp"]                 — OpenCode
  //   "kiro"      + args: ["acp"]                 — Kiro CLI
  //   "kimi"      + args: ["acp"]                 — Kimi CLI
  //   "cline"     + args: ["--acp"]               — Cline
  //   "auggie"    + args: ["--acp"]               — Augment Code
  //   "qwen"      + args: ["--acp"]               — Qwen Code
  //   "openhands" + args: ["acp"]                 — OpenHands
  //   "vibe-acp"                                  — Mistral Vibe
  //
  // 示例（通过适配器）:
  //   "claude-agent-acp"  — Claude Agent (npm: @zed-industries/claude-agent-acp)
  //   "codex-acp"         — Codex CLI (npm: @zed-industries/codex-acp)
  //
  // 示例（自定义 ACP Agent）:
  //   "npx tsx ./my-agent.ts"
  //   "python ./my_agent.py"
  command: string;
  args?: string[];                 // 启动参数（可选，command 也可包含参数）

  // [CHANGED 2026-03-01] 注入子进程的额外环境变量
  // 用于传递 API Key、模型端点等运行时配置
  // 优先级：process.env (继承) < env (本字段) < DISPATCH_TOKEN / DISPATCH_IPC_PATH (系统注入)
  // ⚠️ 避免在此存储敏感信息（配置文件明文），生产环境建议用外部 secret manager 注入 process.env
  env?: Record<string, string>;

  workDir: string;                 // Agent 工作目录（ACP session cwd）；保留 Agent 自身 skills/rules/上下文；产物输出到 {workDir}/.dispatch/output/{taskId-prefix}/
  capabilities?: string[];         // 职责倾向（Worker 类型）
  autoClaimTags?: string[];        // 根据 tag 自动接取
  allowMultiProcess?: boolean;     // 是否允许创建多进程，默认 false
  promptTemplate?: string;         // Worker 启动 prompt 模板路径

  // ACP 能力配置 [CHANGED 2026-02-28]
  // ClientNode 在 initialize 时向 Agent 声明的能力
  // 默认值见下方说明，通常不需要修改
  acpCapabilities?: {
    fs?: {
      readTextFile?: boolean;      // 允许 Agent 读取 workDir 内文件，默认 true
      writeTextFile?: boolean;     // 允许 Agent 写入 workDir 内文件，默认 true
    };
    terminal?: boolean;            // 允许 Agent 创建终端执行命令，默认 true
  };

  // ACP 权限策略 [CHANGED 2026-02-28]
  // 当 Agent 请求 requestPermission 时的自动应答策略
  permissionPolicy?: 'auto-allow' | 'auto-deny' | 'prompt';  // 默认 'auto-allow'
}
```

### Common Mistake: `command` 使用裸命令导致 Agent 启动为交互终端

> **Warning**: 几乎所有 Agent CLI 的**默认模式是交互式终端**（TUI），不是 ACP stdio 服务器。
> 直接使用裸命令（如 `"command": "gemini"` 或 `"command": "cline"`）会导致子进程等待用户输入而非 JSON-RPC 消息，
> 表现为 Worker 启动后立即挂起或超时。

**症状**：Worker 进程启动但不响应 ACP initialize 消息；stderr 可能输出交互式 UI 的 ANSI 转义序列。

**原因**：Agent CLI 默认进入交互模式，需要特定子命令/标志才能切换到 ACP stdio 通信模式。

**修正**：

```jsonc
// ❌ 错误 — 启动交互终端
{ "command": "gemini" }
{ "command": "cline" }
{ "command": "augment" }

// ✅ 正确 — 进入 ACP stdio 模式
{ "command": "gemini", "args": ["--experimental-acp"] }
{ "command": "cline",  "args": ["--acp"] }
{ "command": "auggie", "args": ["--acp"] }  // 注意: 命令名是 auggie 不是 augment
```

**规律总结**：
- 子命令风格（`acp`）：Goose、OpenCode、Kiro、Kimi、OpenHands
- 标志风格（`--acp` / `--experimental-acp`）：Cline、Augment(auggie)、Qwen Code(qwen)、Gemini
- 独立适配器命令：`claude-agent-acp`、`codex-acp`、`vibe-acp`、`pi-acp`（天然 ACP 模式，无需额外参数）

**预防**：配置新 Agent 前，务必查阅其 ACP 文档确认 stdio 模式启动方式。
参考列表：<https://agentclientprotocol.com/get-started/agents>

---

**ACP 能力默认值说明**：

| 能力 | Worker 默认 | Manager 默认 | 说明 |
|------|:----------:|:-----------:|------|
| `fs.readTextFile` | true | true | Agent 可请求读取 workDir 内文件 |
| `fs.writeTextFile` | true | false | Manager 默认只读，不直接写文件 |
| `terminal` | true | false | Worker 需要终端执行 CLI 命令；Manager 不需要 |

### Manager Agent（可选） [CHANGED 2026-02-28]

> Manager Agent **不再是必须的**。是否需要取决于 `dispatchMode`。

| dispatchMode | Manager Agent |
|:------------:|:------------:|
| `manager` | **必须**注册至少一个 |
| `tag-auto` | **不需要**，纯程序分发 |
| `hybrid` | **可选**，有则优先使用 |

- Manager 的角色是 **Node Core 的顾问**，不是通信中枢 [CHANGED 2026-02-28]
- Manager 负责：为 Node 提供任务分发建议、监控 Worker 整体状态、提出调度建议
- Manager **不中转** Worker 通信，Worker 始终通过 CLI 与 Node Core 交互
- Manager 通过 ACP 与 Node Core 双向通信
- 提供 Manager Agent 的默认模板
- **校验规则**：`dispatchMode: 'manager'` 时若未注册 Manager Agent，启动应报错

### Worker Prompt 模板

路径：`{workDir}/templates/worker-prompt.md`（可通过 `AgentConfig.promptTemplate` 覆盖）

> **模板以独立 Markdown 文件存储，运行时参数化拼装。** ClientNode 在 ACP 启动 Worker 时读取模板、替换变量、生成最终 prompt 传入。

#### 模板变量

变量使用 `{{variable}}` 语法，运行时由 ClientNode Core 替换。

**任务信息**：

| 变量 | 类型 | 描述 |
|------|------|------|
| `{{task.id}}` | string | 任务 ID |
| `{{task.title}}` | string | 任务标题 |
| `{{task.description}}` | string | 任务描述（Markdown 原文） |
| `{{task.tags}}` | string | 逗号分隔的标签列表 |
| `{{task.priority}}` | string | 优先级：low/normal/high/urgent |
| `{{task.metadata}}` | string | JSON 格式的附加元数据（可选，无则为 `{}`） |

**Agent 信息**：

| 变量 | 类型 | 描述 |
|------|------|------|
| `{{agent.id}}` | string | 当前 Worker Agent ID |
| `{{agent.workDir}}` | string | Agent 工作目录绝对路径 |
| `{{agent.capabilities}}` | string | 逗号分隔的能力列表 |

**Node 信息**：

| 变量 | 类型 | 描述 |
|------|------|------|
| `{{node.name}}` | string | ClientNode 名称 |
| `{{node.cliPath}}` | string | `dispatch` CLI 可执行文件的绝对路径 |

**产物规范**：

| 变量 | 类型 | 描述 |
|------|------|------|
| `{{artifacts.outputDir}}` | string | 产物输出目录绝对路径（`{workDir}/.dispatch/output/{taskId-prefix}/`） |
| `{{artifacts.instructions}}` | string | **自动生成**的产物格式完整说明（zip + result.json 结构 + 必填字段） |

**CLI 命令参考**：

| 变量 | 类型 | 描述 |
|------|------|------|
| `{{cli.progressCmd}}` | string | 预填充的进度上报命令模板，如 `dispatch worker progress {{task.id}} --percent <0-100> --message "<msg>"` |
| `{{cli.completeCmd}}` | string | 预填充的完成命令模板 |
| `{{cli.failCmd}}` | string | 预填充的失败命令模板 |
| `{{cli.statusCmd}}` | string | 预填充的状态查询命令模板 |
| `{{cli.logCmd}}` | string | 预填充的日志追加命令模板 |
| `{{cli.heartbeatCmd}}` | string | 预填充的心跳命令模板 |
| `{{cli.reference}}` | string | **自动生成**的所有 `dispatch worker` 命令完整参考文档 |

#### 拼装规则

1. ClientNode 读取模板 Markdown 文件
2. 按上表替换所有 `{{variable}}`，未定义的变量保留原样并记录警告日志
3. `{{artifacts.instructions}}` 和 `{{cli.reference}}` 由 Node Core **自动生成**，不在模板中硬编码
4. 拼装后的完整 prompt 通过 ACP 传入 Worker 进程
5. 同一模板可被多个 Worker 复用，每次拼装注入不同的任务信息

#### 必须包含的变量

> **⚠️ 以下变量如果缺失，ClientNode 启动 Worker 时应报警告日志：**

- `{{task.id}}` — Worker 必须知道自己在做什么任务
- `{{task.description}}` — Worker 必须知道任务内容
- `{{artifacts.instructions}}` — Worker 必须知道产物格式要求
- `{{cli.reference}}` — Worker 必须知道怎么和 Node 通信
- `{{agent.workDir}}` — Worker 必须知道在哪个目录工作

#### 默认模板

项目提供初版默认模板：`packages/client-node/src/templates/worker-prompt.md`（见模板文件）

---

## 5. Dashboard Configuration [NEW 2026-03-01]

Dashboard 是独立的 SPA（Vite + React），通过环境变量控制开发服务器行为。

### 开发模式（Vite dev server）

| 环境变量 | 类型 | 默认值 | 说明 |
|----------|------|--------|------|
| `VITE_DASHBOARD_HOST` | string | `false` (localhost only) | 设为 `true` / `0.0.0.0` / `::` 监听全部网络接口 |
| `VITE_DASHBOARD_PORT` | number | `3000` | dev server 端口 |
| `VITE_API_URL` | string | `http://localhost:9800` | 代理目标 Server 地址 |

**快速启动**：

```bash
# 仅本机访问（默认）
pnpm --filter @agentdispatch/dashboard dev

# 局域网访问（其他设备可通过 http://<host-ip>:3000 打开）
pnpm --filter @agentdispatch/dashboard dev:remote

# 自定义 API 地址
VITE_API_URL=http://192.168.1.100:9800 VITE_DASHBOARD_HOST=true pnpm --filter @agentdispatch/dashboard dev
```

### Vite Proxy 端点

| 路径 | 目标 | 说明 |
|------|------|------|
| `/api/*` | `{VITE_API_URL}/api/*` | Server REST API |
| `/health` | `{VITE_API_URL}/health` | Server 健康检查（auth-context 依赖） |

### 安全约束 — 远程访问必须配置鉴权

> **⚠️ 当 Dashboard 暴露到非 localhost 接口时（`VITE_DASHBOARD_HOST=true`），Server 侧必须同时满足：**
>
> 1. `auth.enabled = true`
> 2. `auth.users` 至少包含一个用户（username + password）
>
> **否则任何局域网设备可无需登录直接访问 Dashboard 和全部 API。**

Server 启动时会检查此条件：若 `host` 为 `0.0.0.0` / `::` 且 auth 未配置，控制台输出安全警告。

**配置示例（`server.config.json`）**：

```json
{
  "host": "0.0.0.0",
  "port": 9800,
  "auth": {
    "enabled": true,
    "users": [
      { "username": "admin", "password": "your-strong-password" }
    ],
    "tokens": ["tok_client_xxx"],
    "sessionTtl": 86400000
  }
}
```

---

## 6. Defaults & Overrides

### 优先级（低 → 高）

1. 代码内置默认值
2. 配置文件 (`*.config.json`)
3. 环境变量 (`DISPATCH_*`)
4. CLI 参数 (`--flag`)

### 默认值汇总

| 配置项 | 默认值 |
|--------|--------|
| Server 端口 | `9800` |
| 队列上限 | `1000` |
| 队列处理间隔 | `100ms` |
| 心跳超时 | `60s` |
| 心跳检查间隔 | `15s` |
| 轮询间隔 | `10s` |
| 心跳上报间隔 | `30s` |
| 回调重试次数 | `3` |
| 回调重试间隔 | `5s` |
| 允许多进程 | `false` |
| 产物 zip 最大大小 | `500MB` |
| 产物上传时校验 | `true` |
| 产物保留天数 | `90` |
| 日志按天轮转 | `true` |
| 日志保留天数 | `30` |
| HTTP 日志 | `true` |
| 审计日志 | `true` |
| Agent 交互日志 | `true` |
| Dashboard host | `false` (localhost) |
| Dashboard port | `3000` |
| Dashboard API URL | `http://localhost:9800` |
