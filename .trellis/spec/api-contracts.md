# API Contracts — AgentDispatch

> Document all public interfaces, CLI commands, IPC protocol, and error codes here.

> **⚠️ 变更控制 (CRITICAL)**
>
> 本文档定义的所有接口和契约是 Server、ClientNode、ClientCLI、Dashboard 之间的**刚性约定**。
>
> **变更流程**：
> 1. 评估影响范围 → 列出所有受影响的调用方
> 2. 在本文档中修改并标注 `[BREAKING]` 或 `[CHANGED]` + 日期
> 3. 同步修改 `config-spec.md`（如涉及配置）
> 4. 更新所有受影响模块的测试用例
> 5. Commit 使用 `feat(api)!:` (breaking) 或 `feat(api):` (兼容) 前缀
>
> **禁止**：直接修改代码中的接口签名而不更新本文档。

---

### Change Log

| 日期 | 变更 | 类型 | 影响范围 |
|------|------|------|----------|
| 2026-02-28 | Worker 通信方式明确为 CLI 调用；CLI 新增 `dispatch worker` 命令组（progress/complete/fail/status/log/heartbeat）；Manager 职责收窄为 Node 分发顾问 | [CHANGED] | ClientNode, ClientCLI, Worker |
| 2026-02-28 | 任务完成必须提交产物（zip + result.json）；Task 新增 `artifacts` 字段；complete 接口改为 multipart；新增 4 个 ARTIFACT 错误码 | [CHANGED] | Server, ClientNode, Worker, Dashboard |
| 2026-02-28 | Manager Agent 从必须改为可选；RegisterClientDTO/Client 新增 `dispatchMode` 字段 | [CHANGED] | Server, ClientNode, Dashboard |
| 2026-02-28 | 初始化全部接口定义 | NEW | 全部模块 |

---

## 1. Server RESTful API

Base URL: `http://{host}:{port}/api/v1`

### 1.1 Task Management

| Method | Path | Description | Request Body | Response |
|--------|------|-------------|--------------|----------|
| POST | `/tasks` | 创建任务 | `CreateTaskDTO` | `Task` |
| GET | `/tasks` | 查询任务列表 | Query: `?status=&tag=&page=&limit=` | `Task[]` |
| GET | `/tasks/:id` | 获取任务详情 | - | `Task` |
| PATCH | `/tasks/:id` | 更新任务（进度、状态等） | `UpdateTaskDTO` | `Task` |
| POST | `/tasks/:id/claim` | 申领任务 | `{ clientId, agentId }` | `Task` |
| POST | `/tasks/:id/release` | 释放任务（Worker 中断时） | `{ clientId, reason }` | `Task` |
| POST | `/tasks/:id/complete` | 完成任务（需上传产物） | `multipart: CompleteTaskDTO + files` | `Task` |
| POST | `/tasks/:id/cancel` | 取消任务 | `{ reason? }` | `Task` |
| DELETE | `/tasks/:id` | 删除任务 | - | `void` |

#### Task 状态机

```
created → pending → claimed → in_progress → completed
                                          → failed → pending (可重新申领)
                  → cancelled
```

#### CreateTaskDTO

```typescript
interface CreateTaskDTO {
  title: string;
  description?: string;       // Markdown 格式
  tags: string[];              // 用于匹配 Worker 能力
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  metadata?: Record<string, unknown>;
  callbackUrl?: string;        // 关闭回调地址
}
```

#### Task

```typescript
interface Task {
  id: string;                  // UUID
  title: string;
  description?: string;
  status: TaskStatus;
  tags: string[];
  priority: 'low' | 'normal' | 'high' | 'urgent';
  progress?: number;           // 0-100
  progressMessage?: string;
  claimedBy?: {
    clientId: string;
    agentId: string;
  };
  artifacts?: TaskArtifacts;   // [CHANGED 2026-02-28] 任务产物
  metadata?: Record<string, unknown>;
  callbackUrl?: string;
  createdAt: string;           // ISO 8601
  updatedAt: string;
  claimedAt?: string;
  completedAt?: string;
}

type TaskStatus = 'pending' | 'claimed' | 'in_progress' | 'completed' | 'failed' | 'cancelled';

// ─── [CHANGED 2026-02-28] 任务产物规范 ───────────────────────
//
// ⚠️ 每个任务完成时 **必须** 提交以下两项产物，缺一视为任务失败：
//   1. 一个 .zip 包 — 包含任务的全部工作成果
//   2. 一个 result.json — 对任务结果的结构化描述
//
// 产物不规范（缺少文件 / JSON 格式错误 / 缺少必填字段）→ 自动标记 status: failed

interface TaskArtifacts {
  zipFile: string;             // zip 文件存储路径（Server 端相对路径）
  zipSizeBytes: number;        // zip 文件大小
  zipHash: string;             // SHA-256 校验值
  resultJson: TaskResultJson;  // 结构化结果描述
  uploadedAt: string;          // ISO 8601
}

interface TaskResultJson {
  taskId: string;              // 关联任务 ID
  success: boolean;            // 任务是否成功完成
  summary: string;             // 结果摘要（人类可读）
  outputs: TaskOutput[];       // 产出物清单
  errors?: string[];           // 错误/警告信息
  metrics?: Record<string, number>;  // 可选指标（耗时、代码行数等）
}

interface TaskOutput {
  name: string;                // 产出物名称
  type: string;                // 类型：'file' | 'directory' | 'report' | 'code' | 'other'
  path: string;                // zip 包内的相对路径
  description?: string;        // 说明
}

interface CompleteTaskDTO {
  clientId: string;
  agentId: string;
  summary?: string;            // 可选的人类可读摘要
  // + multipart file: artifact.zip  (必须)
  // + multipart file: result.json   (必须)
}
```

### 1.2 Client Management

| Method | Path | Description | Request Body | Response |
|--------|------|-------------|--------------|----------|
| POST | `/clients/register` | Client 注册 | `RegisterClientDTO` | `Client` |
| DELETE | `/clients/:id` | Client 注销 | - | `void` |
| GET | `/clients` | 获取所有 Client | - | `Client[]` |
| GET | `/clients/:id` | 获取 Client 详情 | - | `Client` |
| POST | `/clients/:id/heartbeat` | 心跳上报 | `HeartbeatDTO` | `void` |
| PATCH | `/clients/:id/agents` | 更新 Agent 列表 | `AgentInfo[]` | `Client` |

#### RegisterClientDTO

```typescript
interface RegisterClientDTO {
  name: string;
  host: string;
  tags?: string[];             // Client 能力标签
  dispatchMode: 'manager' | 'tag-auto' | 'hybrid';  // [CHANGED 2026-02-28] 任务分发模式
  agents: AgentRegistration[];
}

// [CHANGED 2026-02-28] Manager Agent 不再是必须的
// dispatchMode 决定任务分发方式：
//   - 'manager':  由 Manager Agent 决策分发（需注册至少一个 manager 类型 Agent）
//   - 'tag-auto': 程序根据 tag 匹配规则自动分发（无需 Manager Agent）
//   - 'hybrid':   Manager + tag 规则共存，Manager 优先，规则兜底

interface AgentRegistration {
  id: string;
  type: 'manager' | 'worker';
  command: string;             // ACP 版本的命令行
  workDir: string;             // 工作目录
  capabilities?: string[];     // 职责倾向（Worker 类型）
  autoClaimTags?: string[];    // 根据 tag 自动接取
  allowMultiProcess?: boolean; // 是否允许多进程
}
```

#### Client

```typescript
interface Client {
  id: string;
  name: string;
  host: string;
  status: 'online' | 'offline' | 'busy';
  tags: string[];
  dispatchMode: 'manager' | 'tag-auto' | 'hybrid';  // [CHANGED 2026-02-28]
  agents: AgentInfo[];
  lastHeartbeat: string;
  registeredAt: string;
}

interface AgentInfo {
  id: string;
  type: 'manager' | 'worker';
  status: 'idle' | 'busy' | 'offline' | 'error';
  currentTaskId?: string;
  capabilities: string[];
}
```

### 1.3 Task Progress Reporting

| Method | Path | Description | Request Body | Response |
|--------|------|-------------|--------------|----------|
| POST | `/tasks/:id/progress` | 上报任务进度 | `ProgressDTO` | `void` |

```typescript
interface ProgressDTO {
  clientId: string;
  agentId: string;
  progress: number;            // 0-100
  message?: string;
  logs?: string[];             // 最新日志行
}
```

---

## 2. ClientCLI Commands

通过 IPC（Named Pipe / Unix Socket）与 ClientNode 通信。

### 2.1 节点管理

| Command | Description | Arguments |
|---------|-------------|-----------|
| `dispatch start` | 启动 ClientNode | `--config <path>` |
| `dispatch stop` | 停止 ClientNode | `--force?` |
| `dispatch status` | 查看节点状态 | - |
| `dispatch register` | 注册到 Server | `--server <url>` |
| `dispatch unregister` | 从 Server 注销 | - |

### 2.2 Agent 管理

| Command | Description | Arguments |
|---------|-------------|-----------|
| `dispatch agent add` | 注册新 Agent | `--type <manager\|worker> --command <cmd> --workdir <dir> [--tags <t1,t2>] [--auto-claim] [--multi-process]` |
| `dispatch agent remove` | 注销 Agent | `<agent-id>` |
| `dispatch agent list` | 列出所有 Agent | `--status?` |
| `dispatch agent status` | 查看 Agent 详情 | `<agent-id>` |
| `dispatch agent restart` | 重启 Agent | `<agent-id>` |

### 2.3 任务管理

| Command | Description | Arguments |
|---------|-------------|-----------|
| `dispatch task list` | 查看本地任务 | `--status?` |
| `dispatch task assign` | 手动分配任务 | `<task-id> <agent-id>` |
| `dispatch task release` | 释放任务 | `<task-id> [--reason <reason>]` |
| `dispatch task log` | 查看任务日志 | `<task-id> [--follow]` |

### 2.4 Worker 专用命令 [CHANGED 2026-02-28]

> **⚠️ Worker Agent 通过调用这些 CLI 命令与 ClientNode 通信。**
> 这是 Worker 与外部系统交互的**唯一通道**。Worker 不直接调用 Server API，不通过 Manager 中转。

| Command | Description | Arguments |
|---------|-------------|-----------|
| `dispatch worker progress` | 上报任务进度 | `<task-id> --percent <0-100> [--message <msg>]` |
| `dispatch worker complete` | 提交任务产物并标记完成 | `<task-id> --zip <path> --result <path>` |
| `dispatch worker fail` | 报告任务失败 | `<task-id> --reason <reason> [--zip <path>] [--result <path>]` |
| `dispatch worker status` | 查询当前任务状态 | `<task-id>` |
| `dispatch worker log` | 追加工作日志 | `<task-id> --message <msg>` |
| `dispatch worker heartbeat` | Worker 心跳（证明仍在运行） | `<task-id>` |

**调用方式**：Worker Agent 在执行任务过程中，通过 shell 调用上述命令。CLI 通过 IPC 将请求转发给 ClientNode Core，由 Core 统一与 Server 通信。

### 2.5 配置管理

| Command | Description | Arguments |
|---------|-------------|-----------|
| `dispatch config show` | 显示当前配置 | - |
| `dispatch config set` | 设置配置项 | `<key> <value>` |
| `dispatch config edit` | 编辑配置文件 | - |

---

## 3. IPC Protocol (CLI ↔ ClientNode)

使用 Named Pipe (Windows) / Unix Domain Socket 通信。

### 消息格式

```typescript
interface IPCMessage {
  id: string;            // 请求 ID
  type: 'request' | 'response' | 'event';
  command: string;       // 如 "agent.list", "task.assign"
  payload?: unknown;
  error?: IPCError;
}

interface IPCError {
  code: string;
  message: string;
  details?: unknown;
}
```

### 序列化

JSON + 换行符分隔（JSON Lines / ndjson）

---

## 4. ACP Protocol (ClientNode ↔ Agent)

ClientNode 通过 ACP (Agent Communication Protocol) 管理 Agent 进程。

### Agent 启动与 Prompt 模板

Worker 启动时，ClientNode Core 执行以下流程：

```
1. 读取模板文件: AgentConfig.promptTemplate 或默认 {workDir}/templates/worker-prompt.md
2. 参数化拼装: 替换 {{variable}} 为运行时值（任务信息、Agent 信息、CLI 命令等）
3. 校验必要变量: 检查 task.id / task.description / artifacts.instructions / cli.reference / agent.workDir
4. ACP 启动 Worker 进程: 将拼装后的完整 prompt 作为启动参数传入
```

**模板文件**：独立 Markdown 文件，支持 `{{variable}}` 占位符。变量列表和拼装规则详见 `config-spec.md` → Worker Prompt 模板。

**初版模板**：`packages/client-node/src/templates/worker-prompt.md`，必须充分知会 Worker：
- 作为 Worker 的职责边界
- 当前任务的完整信息
- 任务产物格式要求（zip + result.json）
- 可使用的 `dispatch worker` CLI 命令完整参考

---

## 5. Error Codes

| Code | Name | Description |
|------|------|-------------|
| `TASK_NOT_FOUND` | 任务不存在 | 指定 ID 的任务未找到 |
| `TASK_ALREADY_CLAIMED` | 任务已被申领 | 任务已被其他 Client 申领 |
| `TASK_INVALID_TRANSITION` | 无效状态转换 | 任务当前状态不允许此操作 |
| `CLIENT_NOT_FOUND` | Client 不存在 | 指定 ID 的 Client 未注册 |
| `CLIENT_ALREADY_REGISTERED` | Client 已注册 | 同名 Client 已存在 |
| `CLIENT_OFFLINE` | Client 离线 | Client 心跳超时 |
| `AGENT_NOT_FOUND` | Agent 不存在 | 指定 ID 的 Agent 未注册 |
| `AGENT_BUSY` | Agent 忙碌 | Agent 正在执行任务 |
| `AGENT_START_FAILED` | Agent 启动失败 | ACP 命令执行失败 |
| `IPC_CONNECTION_FAILED` | IPC 连接失败 | 无法连接到 ClientNode |
| `IPC_TIMEOUT` | IPC 超时 | 请求超时 |
| `ARTIFACT_MISSING_ZIP` | 产物缺少 zip 包 | 完成任务时未上传 .zip 文件 |
| `ARTIFACT_MISSING_RESULT` | 产物缺少 result.json | 完成任务时未上传 result.json |
| `ARTIFACT_INVALID_JSON` | result.json 格式错误 | JSON 解析失败或缺少必填字段 |
| `ARTIFACT_HASH_MISMATCH` | zip 校验失败 | SHA-256 校验值不匹配 |
| `QUEUE_FULL` | 队列已满 | Server 操作队列已满 |
| `VALIDATION_ERROR` | 校验错误 | 请求参数校验失败 |
| `INTERNAL_ERROR` | 内部错误 | 未预期的内部错误 |

### HTTP 状态码映射

| Error Code | HTTP Status |
|------------|-------------|
| `*_NOT_FOUND` | 404 |
| `*_ALREADY_*` | 409 |
| `*_INVALID_*` | 400 |
| `ARTIFACT_MISSING_*` | 400 |
| `ARTIFACT_INVALID_*` | 400 |
| `ARTIFACT_HASH_MISMATCH` | 400 |
| `VALIDATION_ERROR` | 400 |
| `AGENT_BUSY` | 409 |
| `QUEUE_FULL` | 503 |
| `INTERNAL_ERROR` | 500 |

### 标准错误响应格式

```typescript
interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp: string;
}
```
