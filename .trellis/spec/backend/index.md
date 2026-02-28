# Backend Development Guidelines — AgentDispatch

> Start here before any backend work. Covers Server and ClientNode.

---

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Runtime | Node.js (LTS) | TypeScript strict mode |
| HTTP Framework | Express / Fastify | TBD — 首个 Sprint 确定 |
| ACP SDK | `@agentclientprotocol/sdk` ^0.14.x | Agent 通信协议 (JSON-RPC 2.0 over stdio) [CHANGED 2026-02-28] |
| Testing | Vitest | TDD 驱动 |
| Linting | ESLint + Prettier | 统一代码风格 |
| Package Manager | pnpm | Monorepo workspace |
| Build | tsup / tsx | 快速编译 |
| Validation | zod ^3.25 \| ^4.0 | DTO / config schema 校验 (ACP SDK peer dep) |

---

## Directory Structure (Monorepo)

```
packages/
├── server/                     # Server 模块
│   ├── src/
│   │   ├── index.ts            # 入口
│   │   ├── app.ts              # Express/Fastify app 创建
│   │   ├── routes/             # REST API 路由
│   │   │   ├── tasks.ts
│   │   │   └── clients.ts
│   │   ├── services/           # 业务逻辑
│   │   │   ├── task-service.ts
│   │   │   ├── client-service.ts
│   │   │   └── queue-service.ts
│   │   ├── store/              # 文件持久化
│   │   │   ├── file-store.ts
│   │   │   ├── task-store.ts
│   │   │   └── client-store.ts
│   │   ├── queue/              # 操作队列
│   │   │   └── operation-queue.ts
│   │   ├── types/              # 共享类型
│   │   │   └── index.ts
│   │   └── utils/
│   └── tests/
│       ├── unit/
│       └── integration/
│
├── client-node/                # ClientNode 模块
│   ├── src/
│   │   ├── index.ts            # 入口
│   │   ├── node.ts             # ClientNode 主逻辑
│   │   ├── ipc/                # IPC 服务端
│   │   │   └── ipc-server.ts
│   │   ├── acp/                # ACP Agent 控制 (@agentclientprotocol/sdk)
│   │   │   ├── acp-controller.ts   # Agent 进程 spawn + ClientSideConnection 管理
│   │   │   ├── dispatch-acp-client.ts  # acp.Client 接口实现 (sessionUpdate/requestPermission/fs/terminal)
│   │   │   └── agent-process.ts    # 单个 Agent 进程封装 (lifecycle + stream)
│   │   ├── agents/             # Agent 管理
│   │   │   ├── manager-handler.ts  # Manager ACP 消息处理（可选）
│   │   │   └── worker-manager.ts   # Worker 生命周期管理
│   │   ├── dispatch/           # 任务分发引擎
│   │   │   ├── dispatcher.ts     # 分发策略统一入口
│   │   │   └── tag-matcher.ts    # tag 自动匹配逻辑
│   │   ├── polling/            # Server 轮询
│   │   │   └── task-poller.ts
│   │   ├── templates/          # Prompt 模板
│   │   │   ├── worker-prompt.md  # 默认 Worker 启动模板
│   │   │   └── template-engine.ts  # 模板读取 + 变量替换
│   │   └── types/
│   └── tests/
│
├── client-cli/                 # ClientCLI 模块
│   ├── src/
│   │   ├── index.ts            # CLI 入口
│   │   ├── commands/           # 命令实现
│   │   │   ├── agent.ts
│   │   │   ├── task.ts
│   │   │   ├── worker.ts        # Worker 专用命令 (progress/complete/fail/status/log/heartbeat)
│   │   │   ├── config.ts
│   │   │   └── node.ts
│   │   └── ipc/                # IPC 客户端
│   │       └── ipc-client.ts
│   └── tests/
│
├── shared/                     # 共享代码
│   ├── src/
│   │   ├── types/              # 公共类型定义
│   │   │   ├── task.ts
│   │   │   ├── client.ts
│   │   │   └── agent.ts
│   │   ├── errors/             # 统一错误定义
│   │   │   └── index.ts
│   │   └── utils/              # 公共工具
│   └── tests/
│
└── dashboard/                  # 前端（见 frontend/index.md）
```

---

## Coding Standards

### TypeScript 规范

- `strict: true` — 全部模块必须开启严格模式
- 使用 `interface` 定义数据结构，使用 `type` 定义联合/映射类型
- 禁止 `any`，使用 `unknown` + 类型守卫
- 函数返回值必须显式声明类型
- 使用 `const` 优先，避免 `let`

### 命名规范

| 类型 | 风格 | 示例 |
|------|------|------|
| 文件名 | kebab-case | `task-service.ts` |
| 类 | PascalCase | `TaskService` |
| 接口 | PascalCase | `CreateTaskDTO` |
| 函数/方法 | camelCase | `claimTask()` |
| 常量 | SCREAMING_SNAKE | `MAX_QUEUE_SIZE` |
| 枚举值 | PascalCase | `TaskStatus.InProgress` |

### 模块导入顺序

1. Node.js 内置模块
2. 第三方依赖
3. `@shared/` 共享模块
4. 相对路径模块

---

## Cross-Platform（跨平台强制规范） [CHANGED 2026-02-28]

> **⚠️ 所有产物必须在 Linux / macOS / Windows 三端可构建、可测试、可运行。**
>
> 违反本节任何规则视为 P1 缺陷。

### 文件路径

| 规则 | 正确 | 错误 |
|------|------|------|
| 拼接路径 | `path.join('a', 'b', 'c')` | `'a/b/c'` 或 `'a\\b\\c'` |
| 解析绝对路径 | `path.resolve(baseDir, rel)` | 字符串拼接 |
| 比较路径 | `path.normalize(a) === path.normalize(b)` | 直接字符串比较 |
| 临时目录 | `os.tmpdir()` | 硬编码 `/tmp` 或 `C:\Temp` |
| 用户目录 | `os.homedir()` | 硬编码 `~` 或 `%USERPROFILE%` |

**禁止**：路径中出现硬编码的 `/` 或 `\` 作为分隔符。唯一例外是 URL 路径（HTTP route）。

### IPC 通信

- **Windows**：Named Pipe，路径格式 `\\.\pipe\dispatch-{name}`
- **Linux / macOS**：Unix Domain Socket，路径格式 `{runtimeDir}/dispatch-{name}.sock`

```typescript
import { platform } from 'os';

function getDefaultIpcPath(name: string): string {
  if (platform() === 'win32') {
    return `\\\\.\\pipe\\dispatch-${name}`;
  }
  const runtimeDir = process.env.XDG_RUNTIME_DIR
    ?? path.join(os.tmpdir(), `dispatch-${process.getuid?.() ?? 'default'}`);
  return path.join(runtimeDir, `dispatch-${name}.sock`);
}
```

### 进程管理

| 操作 | 跨平台方案 |
|------|-----------|
| 优雅终止 | 先发 `SIGTERM`，Windows 上使用 `process.kill(pid)` 或 `taskkill` |
| 强制终止 | `SIGKILL`（Unix）/ `taskkill /F`（Windows） |
| 信号监听 | 监听 `SIGINT` + `SIGTERM`；Windows 上 `SIGTERM` 不可靠，额外监听 `'exit'` 事件 |
| 子进程启动 | 使用 `cross-spawn` 或 Node.js `child_process` 的 `shell: true`（慎用）；推荐 `execa` |
| 进程存活检查 | `process.kill(pid, 0)` 三端通用 |

### Shell 命令调用

Worker 通过 CLI 与 Node 通信，CLI 可执行文件路径必须跨平台：

```typescript
function getCliBin(): string {
  // 优先使用 npx/pnpm exec 方式，避免平台差异
  // 或使用 Node.js 直接执行入口文件
  return process.execPath + ' ' + path.resolve(__dirname, '../cli/index.js');
}
```

**禁止**：
- 在 prompt 模板中硬编码 `./dispatch` 或 `dispatch.exe`
- 依赖 `$PATH` 中存在特定可执行文件名

### 文件系统

| 注意项 | 说明 |
|--------|------|
| 大小写敏感性 | Linux 区分大小写，macOS/Windows 默认不区分 → 文件名统一使用 `kebab-case` 小写 |
| 文件锁 | Windows 对打开的文件有强制锁 → 日志文件用追加模式、避免删除正在写入的文件 |
| 换行符 | 程序写出的文件统一使用 `\n`（LF），`.gitattributes` 保证 checkout 一致性 |
| 最大路径长度 | Windows 默认 260 字符限制 → 数据目录不要嵌套过深，任务 ID 使用短格式 |
| 权限位 | `chmod` 在 Windows 上无效 → 不依赖 Unix 权限位做逻辑判断 |

### 环境变量

- Linux/macOS 大小写敏感，Windows 不敏感 → 所有 `DISPATCH_*` 环境变量使用 **SCREAMING_SNAKE_CASE**，代码中按大写读取
- 使用 `process.env` 读取，不使用 shell 特定语法（如 `$VAR`）

### 测试

- CI 矩阵必须包含 `ubuntu-latest`、`macos-latest`、`windows-latest`
- 测试中的文件路径断言使用 `path.join()` 构造期望值，不硬编码分隔符
- 临时文件使用 `os.tmpdir()` + 随机子目录，测试结束清理

**IPC 测试必须使用平台感知路径** [NEW 2026-02-28]：

> **⚠️ Windows 上 `net.Server.listen()` 传入 `.sock` 后缀的文件路径会报 `EACCES: permission denied`。**
> Unix Domain Socket 文件在 Windows 上仅在特定条件下才可用（需要 AF_UNIX 支持且路径格式正确），直接用 `os.tmpdir() + xxx.sock` 在 Windows 上必定失败。

所有创建 IPC 服务端或客户端的测试必须使用平台感知的工具函数：

```typescript
function testIpcPath(label: string): string {
  if (os.platform() === 'win32') {
    return `\\\\.\\pipe\\dispatch-test-${label}-${Date.now()}`;
  }
  return path.join(os.tmpdir(), `ipc-${label}-${Date.now()}.sock`);
}
```

- Windows Named Pipe 无需文件系统清理（内核管理生命周期），`afterEach` 中只需在非 Windows 平台 `unlinkSync`
- `Date.now()` 后缀避免并行测试路径冲突

### Anti-pattern

| Don't | Do |
|-------|-----|
| `fs.writeFileSync('/tmp/foo')` | `fs.writeFileSync(path.join(os.tmpdir(), 'foo'))` |
| `exec('kill -9 ' + pid)` | 使用 `process.kill(pid, 'SIGKILL')` 或 `tree-kill` 库 |
| `path.sep === '/'` 做平台判断 | `process.platform === 'linux'` |
| `#!/usr/bin/env bash` 作为 npm scripts | `tsx src/index.ts` 或 `node dist/index.js` |
| 依赖 `which` / `where` 查找命令 | 使用 `require.resolve()` 或显式配置路径 |
| IPC 测试用 `path.join(tmpdir, 'xxx.sock')` | 用 `testIpcPath()` 平台工具函数（Windows 用 Named Pipe） |

---

## Error Handling

### 错误类层级

```typescript
// base error
class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

class NotFoundError extends AppError { /* 404 */ }
class ConflictError extends AppError { /* 409 */ }
class ValidationError extends AppError { /* 400 */ }
```

### 错误处理模式

- 路由层统一 error handler middleware 捕获
- Service 层抛出具体 `AppError` 子类
- 所有异步操作使用 `try/catch`，禁止裸 Promise
- Agent 进程异常必须捕获并触发任务释放逻辑

---

## Logging & Audit Trail（全量操作日志）

> **⚠️ 核心规则：所有操作必须落盘记录，无论是 Server 还是 Client。**
>
> 这不仅是调试手段，更是系统的**可追溯性基石**。任何 AI 交互、任务事件、HTTP 调用都必须有据可查。

### 日志级别

| Level | Usage |
|-------|-------|
| `error` | 需要立即关注的错误 |
| `warn` | 潜在问题但不影响运行 |
| `info` | 关键业务事件（任务创建/申领/完成） |
| `debug` | 调试信息（仅开发环境） |

### 必须记录的操作类型

**Server 端必须记录**：

| 分类 | 事件 | 日志内容 |
|------|------|----------|
| HTTP 请求 | 所有入站 HTTP 请求 | method, path, params, 请求方 IP/clientId, 响应状态码, 耗时 |
| HTTP 响应 | 所有出站响应 | 对应 requestId, statusCode, body 摘要（脱敏） |
| 任务事件 | 创建/申领/更新/完成/释放/取消 | taskId, 操作者(clientId/agentId), 前后状态, 时间戳 |
| Client 事件 | 注册/注销/心跳/超时标记 | clientId, 事件类型, 时间戳 |
| 回调事件 | 关闭回调发送/重试/成功/失败 | taskId, callbackUrl, 响应状态, 重试次数 |
| 队列事件 | 入队/执行完成/执行失败 | operationType, 耗时, 错误信息 |

**Client 端必须记录**：

| 分类 | 事件 | 日志内容 |
|------|------|----------|
| HTTP 请求 | 所有出站 HTTP 请求（调 Server API） | method, url, body 摘要, 响应状态码, 耗时 |
| HTTP 响应 | 所有 Server 响应 | 对应 requestId, statusCode, body 摘要 |
| 任务事件 | 领取/分发/Worker启动/进度上报/完成/释放 | taskId, agentId, 事件类型, 时间戳 |
| Agent 事件 | 启动/停止/崩溃/重启 | agentId, 进程PID, 退出码, 原因 |
| Manager ACP 交互 | 与 Manager Agent 的 ACP 消息收发 | agentId, 消息方向(send/recv), 消息摘要, 时间戳 |
| Worker CLI 调用 | Worker 通过 CLI 发来的所有命令 | agentId, command(progress/complete/fail/...), payload 摘要, 结果 |
| IPC 事件 | CLI 下发的所有命令及响应（含用户操作和 Worker 操作） | command, 来源(user/worker), payload 摘要, 结果 |
| 轮询事件 | 每次 Server 轮询的结果 | 可用任务数, 空闲 Worker 数, dispatchMode, 分发决策(触发 Manager / tag 自动匹配 / 无匹配跳过) |

### 日志格式规范

```typescript
interface AuditLogEntry {
  timestamp: string;          // ISO 8601
  level: 'error' | 'warn' | 'info' | 'debug';
  source: 'server' | 'client' | 'agent';
  category: string;           // 'http' | 'task' | 'client' | 'agent' | 'ai' | 'ipc' | 'queue' | 'poll'
  event: string;              // 'task.created' | 'http.request' | 'agent.crashed' 等
  message: string;
  context: {
    requestId?: string;       // HTTP 请求关联 ID
    taskId?: string;
    clientId?: string;
    agentId?: string;
    [key: string]: unknown;
  };
  duration?: number;          // 操作耗时（ms）
}
```

### 日志文件存储

**Server 日志目录**：`{dataDir}/logs/`

```
{dataDir}/logs/
├── server-{date}.jsonl         # 主日志（JSON Lines，按天轮转）
├── http-{date}.jsonl           # HTTP 请求/响应日志
└── audit-{date}.jsonl          # 任务/Client 操作审计日志
```

**Client 日志目录**：`{clientWorkDir}/logs/`

```
{clientWorkDir}/logs/
├── client-{date}.jsonl         # 主日志
├── http-{date}.jsonl           # 出站 HTTP 请求/响应日志
├── agent-{agentId}-{date}.jsonl  # 单个 Agent 的交互日志
└── audit-{date}.jsonl          # 任务/Agent 操作审计日志
```

### 日志实现要求

- 使用 **JSON Lines** 格式（每行一个 JSON 对象），便于 grep/jq 查询
- **按天轮转**，文件名包含日期
- HTTP 日志使用**中间件**自动记录，不依赖业务代码手动调用
- Agent 交互日志按 agentId 分文件，便于追踪单个 Agent 的完整会话
- 日志写入使用**追加模式**，异步写入不阻塞主逻辑
- 敏感信息（如 prompt 全文）可截断记录摘要，但**不可跳过不记录**

---

## File Persistence (代替数据库)

### 设计原则

- Server 的所有任务和 Client 数据以文件形式持久化
- **所有写操作必须使用 Write → Rename 原子模式**（见下方详述）
- 读写操作通过操作队列串行化，无需锁

### 原子写入：Write → Rename 模式

> **⚠️ 这是 Server 文件操作的强制模式，禁止直接覆写目标文件。**

**流程**：

```
1. 将内容写入临时文件: {target}.tmp  (同目录)
2. 写入完成后 fsync 确保刷盘
3. 原子 rename: {target}.tmp → {target}
```

**实现要求**：

```typescript
async function atomicWrite(filePath: string, content: string | Buffer): Promise<void> {
  const tmpPath = filePath + '.tmp';
  const fd = await fs.open(tmpPath, 'w');
  try {
    await fd.writeFile(content);
    await fd.sync();          // fsync 确保数据落盘
  } finally {
    await fd.close();
  }
  await fs.rename(tmpPath, filePath);  // 原子操作
}
```

**为什么必须这样做**：

| 场景 | 直接覆写 | Write → Rename |
|------|----------|----------------|
| 写入中途进程崩溃 | 文件损坏（半写状态） | 目标文件不受影响，tmp 文件可清理 |
| 写入中途断电 | 文件可能为空或损坏 | fsync 保证已写入的 tmp 完整 |
| 读写并发（队列串行时不会发生，但防御性设计） | 读到不一致数据 | rename 是原子的，读到的要么是旧文件要么是新文件 |

**适用范围**：

- ✅ 任务文件（.md / .json）
- ✅ Client 注册信息（.json）
- ✅ 配置文件的程序化更新
- ❌ 日志文件（追加模式，不需要原子写）
- ❌ 产物 zip（大文件直接流式写入目标路径，写入完成后校验 hash）

**临时文件清理**：Server 启动时应扫描 `{dataDir}` 下的所有 `.tmp` 文件并删除（上次崩溃留下的残余）

### 文件格式

- **任务详情**：Markdown 文件，frontmatter 含元数据
- **任务元数据**：JSON 文件，程序读写
- **Client 信息**：JSON 文件
- **任务产物**：zip + result.json（见下方「任务产物」章节）

### Markdown Task 文件格式

```markdown
---
id: "uuid-xxx"
title: "实现用户认证"
status: "in_progress"
tags: ["auth", "backend"]
priority: "high"
claimedBy:
  clientId: "client-1"
  agentId: "worker-1"
createdAt: "2026-02-28T10:00:00Z"
---

# 实现用户认证

## 描述

任务描述内容...

## 进度

- [x] 设计 API
- [ ] 实现逻辑
- [ ] 编写测试
```

---

## Prompt Template Engine

Worker 启动时，ClientNode Core 负责模板拼装，并通过 ACP `session/prompt` 将最终 prompt 投递给 Agent。

### 拼装流程

```typescript
async function buildWorkerPrompt(
  task: Task,
  agent: AgentConfig,
  nodeConfig: ClientConfig,
): Promise<string> {
  // 1. 读取模板文件
  const templatePath = agent.promptTemplate
    ?? path.join(agent.workDir, 'templates/worker-prompt.md');
  const template = await fs.readFile(templatePath, 'utf-8');

  // 2. 构建变量上下文
  const vars = buildTemplateVars(task, agent, nodeConfig);

  // 3. 替换变量: {{variable}} → 实际值
  let prompt = template;
  for (const [key, value] of Object.entries(vars)) {
    prompt = prompt.replaceAll(`{{${key}}}`, value);
  }

  // 4. 检查必要变量是否已被替换（不应残留 {{...}}）
  const missing = prompt.match(/\{\{[\w.]+\}\}/g);
  if (missing) {
    logger.warn('Prompt template has unresolved variables', { missing });
  }

  // 5. 校验必须包含的关键变量
  const required = ['task.id', 'task.description', 'artifacts.instructions',
                    'cli.reference', 'agent.workDir'];
  for (const v of required) {
    if (template.includes(`{{${v}}}`) === false) {
      logger.warn(`Template missing required variable: {{${v}}}`);
    }
  }

  return prompt;
}
```

### ACP 投递流程 [CHANGED 2026-02-28]

> 官方参考：https://agentclientprotocol.com/protocol/session-setup / https://agentclientprotocol.com/protocol/prompt-turn

模板拼装完成后，通过 ACP SDK 投递给 Worker Agent：

```typescript
import * as acp from '@agentclientprotocol/sdk';

async function launchWorkerWithTask(
  agentProcess: AgentProcess,   // 已 spawn 的 Agent 进程封装
  task: Task,
  agentConfig: AgentConfig,
  nodeConfig: ClientConfig,
): Promise<void> {
  const { connection } = agentProcess;

  // 1. initialize — 协商协议版本 + 声明 ClientNode 能力
  await connection.initialize({
    protocolVersion: acp.PROTOCOL_VERSION,
    clientCapabilities: {
      fs: { readTextFile: true, writeTextFile: true },
      terminal: true,
    },
    clientInfo: {
      name: 'agentdispatch-node',
      title: nodeConfig.name,
      version: PKG_VERSION,
    },
  });

  // 2. newSession — 创建会话
  const { sessionId } = await connection.newSession({
    cwd: agentConfig.workDir,
    mcpServers: [],
  });

  // 3. 拼装 prompt
  const promptText = await buildWorkerPrompt(task, agentConfig, nodeConfig);

  // 4. session/prompt — 投递任务
  const result = await connection.prompt({
    sessionId,
    prompt: [{ type: 'text', text: promptText }],
  });

  // 5. 根据 stopReason 处理结果
  handleStopReason(result.stopReason, task, agentProcess);
}
```

### 自动生成的变量

以下变量由 Node Core 在运行时自动生成，**不应在模板中硬编码其内容**：

| 变量 | 生成逻辑 |
|------|----------|
| `{{artifacts.instructions}}` | 从 `api-contracts.md` 中 TaskResultJson Schema 自动生成完整的产物格式说明 |
| `{{cli.reference}}` | 从 CLI 命令注册表自动生成所有 `dispatch worker` 命令的用法、参数、示例 |
| `{{cli.progressCmd}}` / `{{cli.completeCmd}}` / ... | 预填充当前 task.id 和路径的命令行模板 |

### 默认模板

初版默认模板位于 `packages/client-node/src/templates/worker-prompt.md`，内容覆盖：
- Worker 角色职责和边界
- 当前任务完整信息
- 产物格式要求（zip + result.json 结构 + 必填字段 + 失败条件）
- 所有 `dispatch worker` CLI 命令的用法
- 标准工作流程
- 行为约束

---

## Task Artifacts（任务产物） [CHANGED 2026-02-28]

> **⚠️ 强制规则：每个任务完成时必须提交产物，产物不规范视为任务失败。**

### 产物组成

每个已完成任务必须包含以下两项文件：

| 文件 | 要求 | 说明 |
|------|------|------|
| `artifact.zip` | **必须** | 包含任务的全部工作成果 |
| `result.json` | **必须** | 结构化结果描述，符合 `TaskResultJson` Schema |

### 存储结构

```
{dataDir}/artifacts/{task-id}/
├── artifact.zip               # 工作成果 zip 包
└── result.json                # 结构化结果描述
```

### result.json 必填字段

```typescript
interface TaskResultJson {
  taskId: string;              // 必须与任务 ID 一致
  success: boolean;            // 任务是否成功
  summary: string;             // 人类可读摘要（不可为空）
  outputs: TaskOutput[];       // 产出物清单（至少 1 项）
  errors?: string[];           // 错误/警告信息
  metrics?: Record<string, number>;
}
```

### 校验流程

Server 收到完成请求时，**必须在状态变更之前**完成以下校验：

```
1. 检查 multipart 请求中是否包含 artifact.zip → 缺失: ARTIFACT_MISSING_ZIP
2. 检查 multipart 请求中是否包含 result.json → 缺失: ARTIFACT_MISSING_RESULT
3. 解析 result.json → 解析失败: ARTIFACT_INVALID_JSON
4. 校验 result.json 必填字段（taskId/success/summary/outputs）→ 缺失: ARTIFACT_INVALID_JSON
5. 校验 result.json.taskId === 当前任务 ID → 不匹配: ARTIFACT_INVALID_JSON
6. 计算 zip SHA-256 并记录 → 校验失败: ARTIFACT_HASH_MISMATCH
7. 检查 zip 大小 ≤ maxZipSizeBytes → 超限: VALIDATION_ERROR
8. 全部通过 → 存储文件 → 更新任务状态为 completed
   任一失败 → 任务状态标记为 failed，附带错误信息
```

### Worker 端要求

- Worker 完成任务时，**必须**将工作产出打包为 zip 并生成 result.json
- Worker prompt 模板中**必须**包含产物格式说明（zip + result.json 的要求）
- ClientNode 在转发完成请求前**应**做本地预校验（减少无效请求）

---

## Operation Queue

### 设计

- 单线程串行处理所有状态变更操作
- 读操作可以直接执行（文件只读安全）
- 写操作全部入队，FIFO 顺序执行
- 队列满时返回 503 (QUEUE_FULL)

### 接口

```typescript
interface OperationQueue {
  enqueue(op: Operation): Promise<void>;
  size(): number;
  drain(): Promise<void>;  // 等待队列清空（用于优雅关闭）
}

interface Operation {
  type: string;
  execute: () => Promise<void>;
}
```

---

## Testing

### TDD 流程

1. 先写失败的测试
2. 写最少代码让测试通过
3. 重构

### 测试分类

| 类型 | 路径 | 描述 |
|------|------|------|
| 单元测试 | `tests/unit/` | 纯逻辑测试，mock 外部依赖 |
| 集成测试 | `tests/integration/` | API 端到端、文件 I/O |
| 黑盒测试 | `tests/e2e/` | 完整功能流程 |

### QA 环境禁止模拟 [NEW 2026-02-28]

> **⚠️ QA 环境必须使用真实组件跑通完整链路，禁止用脚本替代任何环节。**
>
> 详见 `guides/architecture-guide.md` § QA 环境真实性要求。

常见错误：用 curl/fetch 注册 Client + setTimeout 模拟 Worker 进度 + 空 zip 充当产物。
这种"模拟环境"能让 API 返回 200，但无法验证 IPC 通信、Worker 生命周期、真实产物生成等关键链路。

**正确做法**：启动真实 `ClientNode` → `AcpController` 启动真实 Worker 子进程 → Worker 通过 CLI → IPC 上报进度 → Worker 生成真实产物提交。

### 测试命名

```
describe('TaskService')
  it('should create task with valid data')
  it('should throw TASK_NOT_FOUND when id does not exist')
  it('should reject claim on already-claimed task')
```

---

## Common Patterns

### ACP 日志聚合模式 [NEW 2026-02-28]

> **⚠️ ACP session/update 的 `agent_message_chunk` 和 `agent_thought_chunk` 是逐 token 推送的。如果逐条记录会产生数百条碎片日志，完全无法阅读。**

**Pattern**: 在 `DispatchAcpClient` 内维护流式缓冲区，遇到结构化事件边界时才 flush 成一条完整日志。

```typescript
// 缓冲区
private textBuffer = '';
private thinkingBuffer = '';

// 收到 agent_message_chunk → 追加到 textBuffer
// 收到 tool_call / plan / flush 请求 → flush 缓冲区 → 记录完整消息

private flushStreamBuffers(): void {
  if (this.flushingStreams) return;  // 防重入
  this.flushingStreams = true;
  try {
    if (this.textBuffer.length > 0) {
      const text = this.textBuffer;
      this.textBuffer = '';
      this.record('text', text, ...);  // 一条完整消息
    }
    // thinking/prompt 同理
  } finally {
    this.flushingStreams = false;
  }
}
```

**Gotcha — 重入保护**：`flushStreamBuffers()` → `record()` → `flushLogs()` → `flushStreamBuffers()` 可能形成循环调用。必须加 `flushingStreams` 布尔守卫。

**消息边界**：
- `tool_call` / `tool_call_update` / `plan` / `default` 事件到达时 flush
- 定时器周期性 flush（`LOG_FLUSH_INTERVAL`）
- `flushLogs()` 被显式调用时 flush
- `destroy()` 时 flush

### 任务产物隔离（保留 Agent 上下文） [CHANGED 2026-02-28]

> **⚠️ ACP session 的 `cwd` 必须是 Agent 注册时的 `workDir`，不能指向隔离子目录。**
> Agent 的 skills、`AGENTS.md`、`.cursor/rules/`、MCP 配置等上下文文件都在 `workDir` 中，切换 cwd 会导致 Agent 丧失自身能力。

**Pattern**: cwd 不变，产物输出到专用隔离目录：

```
ACP session cwd = {agentConfig.workDir}          ← Agent 原始目录，保留所有上下文
产物输出目录    = {workDir}/.dispatch/output/{taskId.slice(0, 12)}/
```

- ACP `newSession` 的 `cwd` **始终**是 Agent 注册的 `workDir`
- Prompt 中明确告知 Agent 将输出文件写入 `outputDir`
- `collectArtifacts` 只扫描 `outputDir`
- 任务完成后从 `taskOutputDirs` Map 中清理引用

**不要**：
- 用 `workDir` 子目录作为 ACP session cwd（Agent 会丢失上下文）
- 扫描整个 `workDir` 收集产物（会混入 Agent 自身文件和其他任务残留）

### 进度汇报用状态描述，不用百分比 [NEW 2026-02-28]

> **AI Agent 任务的完成时间不可预测。伪造的百分比进度（如根据 plan 步骤计算）会误导用户。**

**Do**: `message: "Calling: curl — 获取视频信息"` — 描述 Agent 当前在做什么

**Don't**: `progress: 67` — 用户看到 67% 会以为快完成了，但 Agent 可能还要做很多步

`ProgressDTO.progress` 字段保留但固定传 `0`（仅触发 `claimed → in_progress` 状态转换），实际进展通过 `message` 字段以自然语言描述。

### 任务状态机合规 [NEW 2026-02-28]

> **Gotcha**: Server 的任务状态机不允许从 `claimed` 直接跳到 `completed`。必须先经过 `in_progress`。

```
claimed → in_progress → completed
```

**在 `handleTaskCompletion` 中**，需要先调用一次 `reportProgress()` 触发 `claimed → in_progress` 转换，然后才能调用 `completeTask()`。否则 Server 会返回 `TASK_INVALID_TRANSITION` 错误。

### ESM/CJS 模块兼容 [NEW 2026-02-28]

> **Gotcha**: 在 ESM 输出的 tsup 构建中，CJS-only 的依赖（如 `adm-zip`）如果被打包进 bundle 会报 `Dynamic require of "fs" is not supported` 错误。

**Fix**: 在 `tsup.config.ts` 的 `external` 数组中显式排除这些包：

```typescript
export default defineConfig({
  external: ['@agentdispatch/shared', 'adm-zip'],
});
```

### ESLint: CLI 包 console 规则 [NEW 2026-02-28]

CLI 包的 `console.log` 是面向用户的正常输出渠道，不应触发 `no-console` 警告。在根 `eslint.config.js` 中为 CLI 包添加 override：

```javascript
{
  files: ['packages/client-cli/src/**/*.ts'],
  rules: { 'no-console': 'off' },
},
```

### Service 层模式

```typescript
class TaskService {
  constructor(
    private store: TaskStore,
    private queue: OperationQueue,
  ) {}

  async createTask(dto: CreateTaskDTO): Promise<Task> {
    const task = this.buildTask(dto);
    await this.queue.enqueue({
      type: 'task.create',
      execute: () => this.store.save(task),
    });
    return task;
  }
}
```

### 防御性编程

- 所有外部输入必须校验（使用 zod 或类似库）
- 文件操作包裹 try/catch 并给出有意义错误
- Agent 进程退出码必须检查

---

## ⚠️ 接口/契约变更红线

> **任何涉及以下内容的修改都属于契约变更，必须审慎处理：**

| 变更类型 | 涉及文件 | 示例 |
|----------|----------|------|
| REST API 路径/方法/参数 | `api-contracts.md` | 新增字段、改路径、删除端点 |
| DTO / 类型定义 | `api-contracts.md` | 增删字段、改类型 |
| IPC 消息格式 | `api-contracts.md` | 改 command 名、payload 结构 |
| 错误码 | `api-contracts.md` | 新增/重命名/删除错误码 |
| 配置 Schema | `config-spec.md` | 增删字段、改默认值、改类型 |
| 环境变量 | `config-spec.md` | 新增/重命名/删除 |

**强制流程**：

1. **先 Spec 再代码** — 在对应 spec 文档中修改并标注 `[BREAKING]`/`[CHANGED]`/`[DEPRECATED]` + 日期
2. **影响分析** — 列出所有消费该接口的模块（Server? ClientNode? CLI? Dashboard?）
3. **同步测试** — 所有受影响模块的测试必须同步更新
4. **Breaking Change Commit** — 使用 `feat(api)!: description` 格式

**绝对禁止**：
- ❌ 改了代码中的接口但没更新 spec
- ❌ Spec 和实现不一致
- ❌ 只改了一端（如只改 Server 不改 Client 消费方）
