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
| 2026-03-01 | 新增 `GET /tasks/:id/stream` SSE 端点，实时推送任务状态变化和交互日志；支持 `interval`、`logs` 查询参数；终态自动关闭连接 | [CHANGED] | Server |
| 2026-03-01 | 任务归档机制：终态任务隔天自动归档到 `tasks-archive/`；新增 `GET /tasks/archived` 返回 `TaskSummary[]`；`GET /tasks/:id` 支持归档回退；归档详情 1h TTL 缓存；Logger 跨天切换 stream；`ServerConfig.archive` 配置块 | [CHANGED] | Server, Dashboard |
| 2026-03-01 | Task 附件功能：`POST /tasks` 支持 multipart/form-data 上传附件（向后兼容 JSON）；新增 `GET /tasks/:id/attachments` 列出附件、`GET /tasks/:id/attachments/:filename` 下载单个附件；Task 新增 `attachments?: TaskAttachment[]` 字段；ClientNode claim 后自动下载附件到 inputDir 并在 prompt 中告知 Agent | [CHANGED] | Server, ClientNode, Dashboard |
| 2026-03-01 | 日志聚合消息边界修正：`plan`/`default` 不再触发 `flushStreamBuffers()`，仅 `tool_call`/`tool_call_update` 触发（真正的阶段切换）；进度上报增加 3s 节流 + 流式粗略状态（Responding.../Thinking...）；ClientNode 新增自动重连（指数退避 2s→30s）；Dashboard 渲染前合并相邻同类型日志条目（text/thinking/prompt 直接拼接，tool_call 组换行拼接） | [CHANGED] | ClientNode, Dashboard |
| 2026-02-28 | ProgressDTO.progress 语义变更：不再表示百分比，固定为 0（仅触发状态机转换），实际状态通过 message 描述；IPC 新增 `task.cancel` 命令；DispatchAcpClient 日志聚合：text/thinking/prompt token 流聚合为完整消息后再记录；新增 ProgressCallback 回调（纯状态描述）；任务 workDir 隔离 | [CHANGED] | ClientNode, Server, Dashboard |
| 2026-02-28 | Worker 通信方式明确为 CLI 调用；CLI 新增 `dispatch worker` 命令组（progress/complete/fail/status/log/heartbeat）；Manager 职责收窄为 Node 分发顾问 | [CHANGED] | ClientNode, ClientCLI, Worker |
| 2026-02-28 | 任务完成必须提交产物（zip + result.json）；Task 新增 `artifacts` 字段；complete 接口改为 multipart；新增 4 个 ARTIFACT 错误码 | [CHANGED] | Server, ClientNode, Worker, Dashboard |
| 2026-02-28 | Manager Agent 从必须改为可选；RegisterClientDTO/Client 新增 `dispatchMode` 字段 | [CHANGED] | Server, ClientNode, Dashboard |
| 2026-02-28 | ACP 实现确定使用 `@agentclientprotocol/sdk` v0.14.x；ACP 协议章节重写为基于 JSON-RPC 2.0 的 SDK 集成规范；新增 ClientNode ACP 能力声明、会话生命周期、双通道通信模型 | [CHANGED] | ClientNode, Worker, Manager |
| 2026-03-01 | Worker 临时 Token：ClientNode 为每个 Worker 进程分配 `wt_<uuid>` 临时 token，通过 `DISPATCH_TOKEN` + `DISPATCH_IPC_PATH` 环境变量注入；任务完成/取消/释放时自动撤销；IPC 鉴权优先匹配本地 workerTokens | [CHANGED] | ClientNode |
| 2026-03-01 | IPC 层鉴权：CLI `--token` / `DISPATCH_TOKEN` 传入 token；Client-Node 对 worker-only IPC 命令验证 token role（通过调用 Server `/auth/me`，60s 缓存）；`IPCMessage` 新增 `token?` 字段；仅当 `ClientConfig.token` 存在时启用 | [CHANGED] | ClientNode, ClientCLI, Shared |
| 2026-03-01 | Server error handler 增强：Fastify JSON 解析错误返回 400（非 500）；空 body + Content-Type:json 的 DELETE 请求不再触发解析错误 | [CHANGED] | Server |
| 2026-03-01 | auth.tokens 支持 `{ token, role }` 格式；新增 `operator` 角色（只读+创建/删除，禁止 worker 操作）；受限端点返回 `403 FORBIDDEN`；`/auth/me` 返回 `role` 字段 | [CHANGED] | Server |
| 2026-03-01 | 新增 Auth 路由（login/logout/me）；所有 API 启用可选 Bearer Token 鉴权；`/health` 返回体新增 `authEnabled` 字段；新增 `UNAUTHORIZED` 错误码 | [CHANGED] | Server, ClientNode, Dashboard |
| 2026-02-28 | 初始化全部接口定义 | NEW | 全部模块 |

---

## 1. Server RESTful API

Base URL: `http://{host}:{port}/api/v1`

### 1.0 Authentication [CHANGED 2026-03-01]

当 `auth.enabled = true` 时，除 `/health` 和 `POST /api/v1/auth/login` 外所有请求须携带 `Authorization: Bearer <token>` 头。

| Method | Path | Description | Request Body | Response |
|--------|------|-------------|--------------|----------|
| POST | `/auth/login` | 用户名密码登录 | `{ username, password }` | `{ token, expiresAt }` |
| POST | `/auth/logout` | 注销当前 session | - (Bearer token in header) | `204` |
| GET | `/auth/me` | 验证 token 有效性 | - (Bearer token in header) | `{ source, role, username?, expiresAt? }` |

Health check 返回体变更：

```json
{ "status": "ok", "version": "0.0.1", "authEnabled": true }
```

#### Token 角色权限 [CHANGED 2026-03-01]

| 角色 | 来源 | 权限 |
|------|------|------|
| `admin` | Session token (login) | 完全权限 |
| `client` | Static token (默认) | 完全权限（ClientNode worker 使用） |
| `operator` | Static token (显式指定) | 可创建/删除/查看任务；**禁止** claim/release/progress/complete/cancel/patch 任务状态操作；**禁止** client 注册/心跳/注销/日志追加 |

受 operator 角色限制的端点（返回 `403 FORBIDDEN`）：

| 端点 | 说明 |
|------|------|
| `PATCH /tasks/:id` | 更新任务 |
| `POST /tasks/:id/claim` | 领取任务 |
| `POST /tasks/:id/release` | 释放任务 |
| `POST /tasks/:id/progress` | 上报进度 |
| `POST /tasks/:id/complete` | 完成任务 |
| `POST /tasks/:id/cancel` | 取消任务 |
| `POST /tasks/:id/logs` | 追加任务日志 |
| `POST /clients/register` | 注册 Client |
| `DELETE /clients/:id` | 注销 Client |
| `POST /clients/:id/heartbeat` | 客户端心跳 |
| `PATCH /clients/:id/agents` | 更新 Agent |
| `POST /clients/:id/logs` | 追加客户端日志 |

#### IPC 层鉴权 [NEW 2026-03-01]

当 `ClientConfig.token` 存在时（即 Server 启用了鉴权），Client-Node 的 IPC 通道也会对 **worker-only** 命令执行鉴权。

**CLI 使用方式**：

```bash
dispatch --token <token> worker progress <taskId> --percent 50
# 或通过环境变量
DISPATCH_TOKEN=tok_xxx dispatch worker progress <taskId> --percent 50
```

**协议**：`IPCMessage` 新增 `token?: string` 字段。CLI 将 `--token` 或 `DISPATCH_TOKEN` 的值填入此字段。

**验证流程**：
1. Client-Node 收到 IPC 请求
2. 如果命令是 worker-only 且 `ClientConfig.token` 存在，则使用请求中的 `token` 调用 Server `GET /api/v1/auth/me` 获取 role
3. 如果 role 不是 `admin` 或 `client`，返回 IPC 错误 `{ code: 'FORBIDDEN' }`
4. 验证结果缓存 60 秒

**受限 IPC 命令**（需要 `admin` / `client` 角色）：

| IPC 命令 | 对应 CLI |
|----------|---------|
| `worker.progress` | `dispatch worker progress` |
| `worker.complete` | `dispatch worker complete` |
| `worker.fail` | `dispatch worker fail` |
| `worker.status` | `dispatch worker status` |
| `worker.log` | `dispatch worker log` |
| `worker.heartbeat` | `dispatch worker heartbeat` |
| `task.assign` | `dispatch task assign` |
| `task.release` | `dispatch task release` |
| `task.cancel` | N/A (internal) |

**开放 IPC 命令**（任何 token 或无 token）：
`node.status`, `node.register`, `node.unregister`, `node.stop`, `task.list`, `config.show`, `agent.*`

#### Worker 临时 Token [NEW 2026-03-01]

当 `ClientConfig.token` 存在时，Client-Node 为每个被分配任务的 Worker 进程自动生成一个临时 token。

**生命周期**：
1. **创建**：Worker 被分配任务（claim 成功后、launch 前），Client-Node 生成 `wt_<uuid>` token
2. **注入**：通过环境变量 `DISPATCH_TOKEN` 和 `DISPATCH_IPC_PATH` 传递给 Worker 子进程
3. **使用**：Worker 进程内执行 `dispatch worker progress` 等 CLI 命令时自动携带 token
4. **撤销**：任务完成（end_turn）、Agent 退出、任务取消、Node 停止时自动撤销

**验证优先级**：
```
IPC 请求带 token
  ↓ 检查本地 workerTokens Map → 匹配 → 放行
  ↓ 未匹配
  ↓ 调用 Server /auth/me → 获取 role → admin/client 放行
  ↓ 其他 role
  → FORBIDDEN
```

**安全特性**：
- token 格式 `wt_` 前缀，与 Server 静态 token 区分
- 进程结束后 token 立即失效
- 不可跨 Agent 复用（一个 token 绑定一个 agentId + taskId）

### 1.1 Task Management

| Method | Path | Description | Request Body | Response |
|--------|------|-------------|--------------|----------|
| POST | `/tasks` | 创建任务（支持附件） | `CreateTaskDTO` (JSON) 或 `multipart: data + files` | `Task` |
| GET | `/tasks` | 查询活跃任务列表 | Query: `?status=&tag=&page=&limit=` | `Task[]` |
| GET | `/tasks/archived` | 查询归档任务摘要 [NEW 2026-03-01] | Query: `?tag=&search=&page=&limit=` | `TaskSummary[]` |
| GET | `/tasks/:id` | 获取任务详情（支持归档回退）| - | `Task` |
| PATCH | `/tasks/:id` | 更新任务（进度、状态等） | `UpdateTaskDTO` | `Task` |
| POST | `/tasks/:id/claim` | 申领任务 | `{ clientId, agentId }` | `Task` |
| POST | `/tasks/:id/release` | 释放任务（Worker 中断时） | `{ clientId, reason }` | `Task` |
| POST | `/tasks/:id/complete` | 完成任务（需上传产物） | `multipart: CompleteTaskDTO + files` | `Task` |
| POST | `/tasks/:id/cancel` | 取消任务 | `{ reason? }` | `Task` |
| DELETE | `/tasks/:id` | 删除任务 | - | `void` |
| GET | `/tasks/:id/attachments` | 列出任务附件 | - | `TaskAttachment[]` |
| GET | `/tasks/:id/attachments/:filename` | 下载单个附件 | - | `binary stream` |

#### Task 状态机

```
created → pending → claimed → in_progress → completed
                                          → failed → pending (可重新申领)
                  → cancelled
```

#### CreateTaskDTO

支持两种 Content-Type（向后兼容）：

- **`application/json`**：直接传 JSON body（无附件）
- **`multipart/form-data`** [CHANGED 2026-03-01]：`data` 字段为 JSON 字符串（CreateTaskDTO），`files` 字段为 0-N 个附件文件

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
  progress?: number;           // [CHANGED 2026-02-28] 保留字段，不再用于展示百分比
  progressMessage?: string;   // [CHANGED 2026-02-28] Agent 当前活动状态描述
  claimedBy?: {
    clientId: string;
    agentId: string;
  };
  attachments?: TaskAttachment[]; // [CHANGED 2026-03-01] 创建时上传的输入文件
  artifacts?: TaskArtifacts;   // [CHANGED 2026-02-28] 任务产物
  metadata?: Record<string, unknown>;
  callbackUrl?: string;
  createdAt: string;           // ISO 8601
  updatedAt: string;
  claimedAt?: string;
  completedAt?: string;
}

type TaskStatus = 'pending' | 'claimed' | 'in_progress' | 'completed' | 'failed' | 'cancelled';

// ─── [NEW 2026-03-01] 归档任务摘要 ──────────────────────────────
//
// 归档列表端点 GET /tasks/archived 返回的轻量类型。
// 不包含 description、artifacts、metadata 等重字段。
// 完整数据通过 GET /tasks/:id 按需加载（Server 端带 1h TTL 缓存）。

interface TaskSummary {
  id: string;
  title: string;
  status: TaskStatus;
  tags: string[];
  priority: 'low' | 'normal' | 'high' | 'urgent';
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  archived: true;              // 始终为 true，供前端区分
}

// ─── [CHANGED 2026-03-01] 任务附件（输入文件） ──────────────────
//
// 创建任务时可通过 multipart/form-data 上传附件文件。
// ClientNode claim 后自动下载到 {workDir}/.dispatch/input/{taskId-prefix}/
// 并在 Agent prompt 中列出文件清单和路径。

interface TaskAttachment {
  filename: string;            // 服务端存储文件名（sanitized）
  originalName: string;        // 原始文件名
  sizeBytes: number;           // 文件大小
  mimeType: string;            // MIME 类型
  uploadedAt: string;          // ISO 8601
}

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

### 1.3 Task Status Stream (SSE) [NEW 2026-03-01]

| Method | Path | Description | Query Params | Response |
|--------|------|-------------|--------------|----------|
| GET | `/tasks/:id/stream` | SSE 实时推送任务状态变化和日志 | `interval` (ms, 默认 2000), `logs` (true/false, 默认 true) | `text/event-stream` |

Server-Sent Events 端点，建立长连接后持续推送以下事件：

| 事件名 | 触发条件 | 数据结构 |
|--------|---------|---------|
| `task` | 任务状态或进度变化（`updatedAt` 改变） | `{ id, status, progress, progressMessage, claimedBy, updatedAt, completedAt }` |
| `logs` | 有新的交互日志 | `InteractionLogEntry[]` |
| `done` | 任务到达终态（completed/failed/cancelled） | `{ taskId, finalStatus }` |
| `error` | 轮询出错 | `{ message }` |

**行为**：
- 连接建立后立即推送当前状态
- 按 `interval` 参数轮询检测变化（范围 500-30000ms）
- 任务到达终态后发送 `done` 事件并关闭连接
- 客户端断开时自动清理

**使用示例**：

```bash
curl -N "http://localhost:9800/api/v1/tasks/{taskId}/stream?interval=1000&logs=true"
```

```javascript
const es = new EventSource('/api/v1/tasks/{taskId}/stream?interval=1000');
es.addEventListener('task', (e) => console.log(JSON.parse(e.data)));
es.addEventListener('logs', (e) => console.log(JSON.parse(e.data)));
es.addEventListener('done', (e) => { console.log('Task finished:', JSON.parse(e.data)); es.close(); });
```

### 1.4 Task Progress Reporting

| Method | Path | Description | Request Body | Response |
|--------|------|-------------|--------------|----------|
| POST | `/tasks/:id/progress` | 上报任务进度 | `ProgressDTO` | `void` |

```typescript
interface ProgressDTO {
  clientId: string;
  agentId: string;
  progress: number;            // [CHANGED 2026-02-28] 固定传 0；不再表示百分比，仅用于触发 claimed → in_progress 状态转换
  message?: string;            // [CHANGED 2026-02-28] Agent 当前状态描述（如 "Calling: curl"、"分析视频元数据"），替代百分比进度
  logs?: string[];             // 最新日志行
}
```

> **⚠️ [CHANGED 2026-02-28] 进度语义变更**：`progress` 字段不再承载有意义的百分比数值。Agent 执行过程的实际状态通过 `message` 字段以自然语言描述。Dashboard 展示时显示状态文本而非进度条。

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

### IPC 命令列表

| command | 说明 | payload | response |
|---------|------|---------|----------|
| `node.status` | 查询节点状态 | - | `{ registered, clientId, serverUrl, ... }` |
| `node.register` | 注册到 Server | - | `Client` |
| `node.unregister` | 从 Server 注销 | - | `{ success: true }` |
| `node.stop` | 停止节点 | - | `{ success: true }` |
| `task.list` | 查看 pending 任务 | - | `Task[]` |
| `task.cancel` | 取消运行中任务 [NEW 2026-02-28] | `{ taskId: string; reason?: string }` | `{ success: boolean; message: string }` |
| `worker.progress` | 上报任务进度 | `{ taskId, agentId, progress, message? }` | `{ success: true }` |
| `worker.status` | 查看 Worker 状态 | `{ agentId: string }` | `WorkerState` |
| `config.show` | 显示当前配置 | - | `ClientConfig` |

### 序列化

JSON + 换行符分隔（JSON Lines / ndjson）

---

## 4. ACP Protocol (ClientNode ↔ Agent) [CHANGED 2026-02-28]

> **实现依赖**：`@agentclientprotocol/sdk` v0.14.x (npm)
>
> **官方文档**：https://agentclientprotocol.com
>
> ACP (Agent Client Protocol) 是标准化 **代码编辑器 (Client)** 与 **编程 Agent** 之间通信的开放协议。
> 协议基于 **JSON-RPC 2.0**，消息编码为 UTF-8，通过 **stdio** 传输（换行符分隔，每条消息不含内嵌换行）。
>
> 在 AgentDispatch 中，**ClientNode 扮演 ACP Client**，**Worker / Manager Agent 扮演 ACP Agent**。

### 4.1 传输层 (Transport)

> 参考：https://agentclientprotocol.com/protocol/transports

ACP 使用 **stdio 传输**：
- Client (ClientNode) 启动 Agent 作为**子进程**
- Agent 从 **stdin** 读取 JSON-RPC 消息，向 **stdout** 写入 JSON-RPC 消息
- 消息以**换行符 (`\n`) 分隔**，单条消息**不得包含内嵌换行**
- Agent **可**向 **stderr** 写入日志（Client 可捕获、转发或忽略）
- Agent 的 stdout **只能**写有效 ACP 消息；Client 的 stdin **只能**写有效 ACP 消息

**SDK 封装**：

```typescript
import * as acp from '@agentclientprotocol/sdk';
import { spawn } from 'node:child_process';
import { Readable, Writable } from 'node:stream';

const proc = spawn(command, args, {
  cwd: agentConfig.workDir,
  stdio: ['pipe', 'pipe', 'inherit'],  // stderr 继承到 ClientNode 日志
});

const input = Writable.toWeb(proc.stdin!);
const output = Readable.toWeb(proc.stdout!) as ReadableStream<Uint8Array>;
const stream = acp.ndJsonStream(input, output);

const connection = new acp.ClientSideConnection(
  (agent) => new DispatchAcpClient(agent, nodeContext),
  stream,
);
```

| SDK 核心类 / 函数 | 角色 | 说明 |
|-------------------|------|------|
| `ClientSideConnection` | ClientNode 使用 | 实现 `Agent` 接口：`initialize` / `newSession` / `prompt` / `cancel` 等 |
| `AgentSideConnection` | Agent 进程使用 | 实现 `Client` 回调：`sessionUpdate` / `requestPermission` / `fs/*` / `terminal/*` |
| `ndJsonStream(input, output)` | 双方 | 将 stdin/stdout Web Stream 封装为 ACP `Stream` 类型 |
| `PROTOCOL_VERSION` | 双方 | 当前协议 MAJOR 版本号（整数），用于 `initialize` 握手 |

### 4.2 初始化 (Initialization)

> 参考：https://agentclientprotocol.com/protocol/initialization

所有通信之前，Client **必须**先调用 `initialize` 完成版本协商和能力交换。

**ClientNode 发送**：

```typescript
const initResult = await connection.initialize({
  protocolVersion: acp.PROTOCOL_VERSION,   // Client 支持的最新协议版本
  clientCapabilities: {
    fs: {
      readTextFile: true,      // 提供 fs/read_text_file 方法
      writeTextFile: true,     // 提供 fs/write_text_file 方法
    },
    terminal: true,            // 提供 terminal/* 方法
  },
  clientInfo: {
    name: 'agentdispatch-node',
    title: 'AgentDispatch ClientNode',
    version: '<package version>',
  },
});
```

**Agent 响应**（示例）：

```json
{
  "protocolVersion": 1,
  "agentCapabilities": {
    "loadSession": false,
    "promptCapabilities": { "image": false, "audio": false, "embeddedContext": true }
  },
  "agentInfo": { "name": "my-worker", "version": "1.0.0" }
}
```

**版本协商规则**：
- Client 发送自己支持的最新版本
- Agent 支持该版本 → 响应相同版本；否则 → 响应自己支持的最新版本
- Client 不支持 Agent 响应的版本 → **应**关闭连接

**能力规则**：
- 所有能力均为可选，未在请求中声明的能力视为**不支持**
- Agent **不得**调用 Client 未声明支持的方法

### 4.3 会话管理 (Session)

> 参考：https://agentclientprotocol.com/protocol/session-setup

**创建会话**：

```typescript
const { sessionId } = await connection.newSession({
  cwd: agentConfig.workDir,     // 绝对路径，作为 session 的文件系统上下文
  mcpServers: [],               // 可选：MCP Server 配置列表
});
```

`session/new` 参数：
- `cwd`：**必须**为绝对路径，Agent **必须**以此目录为 session 上下文（不管 Agent 进程的 spawn 目录）
- `mcpServers`：可选的 MCP Server 连接配置（stdio / HTTP / SSE 三种传输）

**一个连接可支持多个并发 session**。

### 4.4 Prompt Turn (核心交互循环)

> 参考：https://agentclientprotocol.com/protocol/prompt-turn

```
Client (Node)                              Agent (Worker/Manager)
    │                                            │
    │──── session/prompt (text content) ────────→│  投递任务 prompt
    │                                            │
    │     ┌────────── Prompt Turn ─────────────┐ │
    │     │                                    │ │
    │←─── session/update (plan)               ←│ │  Agent 计划
    │←─── session/update (agent_message_chunk) ←│ │  Agent 消息流
    │←─── session/update (tool_call)          ←│ │  报告 tool 调用
    │     │                                    │ │
    │     │  [如需权限]                         │ │
    │←─── session/request_permission          ←│ │  请求授权
    │──── RequestPermissionResponse ───────────→│ │  授权 / 拒绝
    │     │                                    │ │
    │←─── session/update (tool_call_update)   ←│ │  tool 进度 / 完成
    │     │                                    │ │
    │     │  [如需文件系统]                     │ │
    │←─── fs/read_text_file                   ←│ │  Agent 请求读文件
    │──── ReadTextFileResponse ────────────────→│ │
    │←─── fs/write_text_file                  ←│ │  Agent 请求写文件
    │──── WriteTextFileResponse ───────────────→│ │
    │     │                                    │ │
    │     │  [如需终端]                         │ │
    │←─── terminal/create                     ←│ │  Agent 请求创建终端
    │──── CreateTerminalResponse (terminalId) ─→│ │
    │←─── terminal/wait_for_exit              ←│ │  等待命令结束
    │──── WaitForExitResponse ─────────────────→│ │
    │←─── terminal/release                    ←│ │  释放终端
    │     │                                    │ │
    │     └────────────────────────────────────┘ │
    │                                            │
    │←─── PromptResponse (stopReason) ──────────│  回合结束
    │                                            │
    │──── (可选) session/cancel ────────────────→│  中断当前操作
```

**Stop Reasons** (Agent 终止回合的原因)：

| stopReason | 含义 | AgentDispatch 处理 |
|------------|------|-------------------|
| `end_turn` | LLM 正常完成 | 检查任务是否已通过 CLI 提交产物 |
| `max_tokens` | 达到 token 上限 | 记录警告；检查是否已提交产物 |
| `max_model_requests` | 达到单轮最大请求次数 | 同上 |
| `refused` | Agent 拒绝继续 | 标记任务失败，记录拒绝原因 |
| `cancelled` | Client 发送了 `session/cancel` | 释放任务，状态回 pending |

### 4.5 DispatchAcpClient — Client 接口实现

ClientNode 需实现 ACP `Client` 接口，处理 Agent 发起的请求和通知：

**Baseline 方法（必须实现）**：

| Agent → Client 方法 | 类型 | ClientNode 处理 |
|---------------------|------|----------------|
| `session/request_permission` | Request | 按 `AgentConfig.permissionPolicy` 自动响应；Worker 默认 `auto-allow`，Manager 默认 `auto-deny` |
| `session/update` | Notification | 分发到日志记录；[CHANGED 2026-02-28] text/thinking/prompt token 流在内存中聚合，遇到结构化事件（tool_call/plan）或 flush 时才写入完整消息段 |

**文件系统方法（按 ClientCapabilities 声明）**：

> 参考：https://agentclientprotocol.com/protocol/file-system

| Agent → Client 方法 | 能力要求 | ClientNode 处理 |
|---------------------|---------|----------------|
| `fs/read_text_file` | `fs.readTextFile: true` | 读取文件内容；**必须**限制在 Agent `workDir` 范围内；支持 `line` + `limit` 参数做分页读取 |
| `fs/write_text_file` | `fs.writeTextFile: true` | 写入文件内容；**必须**限制在 Agent `workDir` 范围内；文件不存在时创建；记录文件变更审计日志 |

**终端方法（按 ClientCapabilities 声明）**：

> 参考：https://agentclientprotocol.com/protocol/terminals

| Agent → Client 方法 | 说明 |
|---------------------|------|
| `terminal/create` | 在 ClientNode 环境中启动命令（command + args + env + cwd）；立即返回 `terminalId`，不等待完成 |
| `terminal/output` | 获取终端当前输出（不阻塞）；含 `truncated` 标志和 `exitStatus`（如已退出） |
| `terminal/wait_for_exit` | 阻塞等待终端命令结束；返回 `exitCode` + `signal` |
| `terminal/kill` | 终止命令但**不释放**终端（仍可获取输出） |
| `terminal/release` | 终止命令（如仍在运行）并释放所有资源；之后 terminalId 失效 |

**终端安全约束**：
- `terminal/create` 的 `cwd` **必须**限制在 Agent `workDir` 范围内
- 环境变量 `env` 可由 ClientNode 过滤（如禁止覆盖 `PATH`）
- 所有终端操作**必须**记录审计日志

### 4.6 Tool Calls 与 Permission

> 参考：https://agentclientprotocol.com/protocol/tool-calls

Agent 通过 `session/update` 通知报告 tool call 执行：

**Tool Call 种类 (kind)**：`read` | `edit` | `delete` | `move` | `search` | `execute` | `think` | `fetch` | `other`

**Tool Call 状态 (status)**：`pending` → `in_progress` → `completed` | `error`

**Permission 流程**：Agent 在执行敏感操作前**可**通过 `session/request_permission` 请求授权。ClientNode 按配置策略响应：

| `permissionPolicy` 值 | 行为 |
|-----------------------|------|
| `auto-allow` | 选择第一个 `kind: "allow_once"` 的选项 |
| `auto-deny` | 选择第一个 `kind: "reject_once"` 的选项 |
| `prompt` | 记录日志 + 选择 `auto-allow`（v1.0 暂不支持交互式审批） |

当 prompt turn 被取消 (`session/cancel`) 时，Client **必须**对所有 pending 的 permission 请求响应 `outcome: "cancelled"`。

### 4.7 Worker 启动与 Prompt 投递

Worker 启动时，ClientNode Core 执行以下流程：

```
1. spawn Worker 子进程 (AgentConfig.command)
   └─ stdio: ['pipe', 'pipe', 'inherit']
2. 建立 ACP 连接: ndJsonStream + ClientSideConnection
3. initialize → 协商协议版本 + 声明 ClientCapabilities (fs + terminal)
4. [CHANGED 2026-02-28] 创建任务隔离目录: {agentConfig.workDir}/tasks/{taskId-prefix}/
   newSession → 创建会话 (cwd = 隔离目录)，获取 sessionId
5. 拼装 prompt:
   a. 读取模板文件: AgentConfig.promptTemplate 或默认 worker-prompt.md
   b. 替换 {{variable}} 为运行时值（任务信息、Agent 信息、CLI 命令等）
   c. 校验必要变量 (task.id / task.description / artifacts.instructions / cli.reference / agent.workDir)
6. session/prompt → 将拼装后的 prompt 作为 text content 发送
7. 处理 session/update 通知 → 记录日志、处理 tool calls / permissions
8. 等待 PromptResponse → 根据 stopReason 处理结果
```

**Prompt 内容格式** (遵循 ACP ContentBlock 规范)：

```typescript
await connection.prompt({
  sessionId,
  prompt: [
    { type: 'text', text: assembledPromptMarkdown },
  ],
});
```

**模板文件**：独立 Markdown 文件，支持 `{{variable}}` 占位符。变量列表和拼装规则详见 `config-spec.md` → Worker Prompt 模板。

**初版模板**：`packages/client-node/src/templates/worker-prompt.md`，必须充分知会 Worker：
- 作为 Worker 的职责边界
- 当前任务的完整信息
- 任务产物格式要求（zip + result.json）
- 可使用的 `dispatch worker` CLI 命令完整参考

### 4.8 Worker 的 CLI 调用路径

Worker Agent 通过 CLI 命令进行结构化任务操作（进度上报、产物提交、失败报告）。
CLI 命令的执行有两条等价路径，都最终到达 ClientNode Core：

**路径 A — Agent 直接 shell exec（推荐）**：
```
Worker 进程 → shell exec `dispatch worker progress <task-id> ...`
  → CLI 进程 → IPC → Node Core → HTTP → Server
```

**路径 B — Agent 通过 ACP terminal/create**：
```
Worker 进程 → ACP terminal/create { command: "dispatch", args: ["worker","progress",...] }
  → ClientNode 创建终端执行命令
  → CLI 进程 → IPC → Node Core → HTTP → Server
```

两条路径功能等价。路径 A 更简单且兼容所有 ACP Agent（Agent 只需有 shell 访问权）；路径 B 对 ClientNode 有更好的可观测性（终端输出可嵌入 tool call 展示）。

**v1.0 默认：路径 A**，prompt 模板中指导 Worker 直接 shell exec CLI 命令。

**Manager Agent 仅使用 ACP 通道**：Manager 通过 `session/prompt` 接收分发咨询请求，通过 `PromptResponse` 返回建议，不使用 CLI。

### 4.9 ACP 错误处理

| 场景 | 处理 |
|------|------|
| Agent 进程启动失败 (spawn error) | 抛出 `AGENT_START_FAILED`，记录 stderr |
| `initialize` 失败 (版本不兼容) | 关闭连接，终止进程，抛出 `AGENT_START_FAILED` |
| `session/prompt` → `stopReason: "end_turn"` | 正常完成；检查任务是否已通过 CLI 提交产物 |
| `session/prompt` → `stopReason: "cancelled"` | 释放任务，状态回 pending |
| `session/prompt` → `stopReason: "refused"` | 标记任务失败，记录拒绝原因 |
| `session/prompt` → `stopReason: "max_tokens"` | 记录警告；检查任务是否已通过 CLI 提交产物 |
| `session/prompt` → `stopReason: "max_model_requests"` | 同 max_tokens |
| Agent 进程意外退出 (非 0 exit code) | 检查任务状态：已 complete → 正常；否则 → 释放任务 |
| `connection.signal` aborted | 连接断开，同进程退出处理 |

### 4.10 ACP 扩展 (Extensibility)

> 参考：https://agentclientprotocol.com/protocol/extensibility

ACP 支持通过 `_` 前缀添加自定义方法和通知，通过 `_meta` 字段添加自定义数据。

**v1.0 不使用扩展方法**。所有 AgentDispatch 特有操作通过 CLI 通道完成。

未来可考虑的扩展：
- `_dispatch/taskStatus` — Agent 通过 ACP 直接查询任务状态
- `_dispatch/submitArtifact` — Agent 通过 ACP 直接提交产物

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
| `UNAUTHORIZED` | 未授权 | Token 缺失、无效或已过期 |
| `FORBIDDEN` | 权限不足 | Token 角色无权执行此操作（如 operator 尝试 claim） |
| `AUTH_DISABLED` | 鉴权未启用 | 在 auth.enabled=false 时调用 login 接口 |
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
| `UNAUTHORIZED` | 401 |
| `FORBIDDEN` | 403 |
| `AUTH_DISABLED` | 404 |
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
