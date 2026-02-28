# Backend Development Guidelines — AgentDispatch

> Start here before any backend work. Covers Server and ClientNode.

---

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Runtime | Node.js (LTS) | TypeScript strict mode |
| HTTP Framework | Express / Fastify | TBD — 首个 Sprint 确定 |
| Testing | Vitest | TDD 驱动 |
| Linting | ESLint + Prettier | 统一代码风格 |
| Package Manager | pnpm | Monorepo workspace |
| Build | tsup / tsx | 快速编译 |

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
│   │   ├── acp/                # ACP Agent 控制
│   │   │   ├── acp-controller.ts
│   │   │   └── agent-process.ts
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

Worker 启动时，ClientNode Core 负责模板拼装。

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

### 测试命名

```
describe('TaskService')
  it('should create task with valid data')
  it('should throw TASK_NOT_FOUND when id does not exist')
  it('should reject claim on already-claimed task')
```

---

## Common Patterns

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
