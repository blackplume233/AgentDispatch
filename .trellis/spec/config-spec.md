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
| 2026-02-28 | ServerConfig 新增 `artifacts` 配置段；Server 数据目录新增 `artifacts/{task-id}/` 存储结构 | [CHANGED] | Server |
| 2026-02-28 | ClientConfig 新增 `dispatchMode` 字段；Manager Agent 从必须改为按模式可选；DispatchRule 新增 `priority`；autoDispatch 新增 `fallbackAction` | [CHANGED] | ClientNode, Server, Dashboard |
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
| `DISPATCH_CLIENT_IPC_PATH` | string | 平台相关 | ClientNode IPC 管道/socket 路径 |

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
}
```

### Server 数据目录结构

```
{dataDir}/
├── tasks/
│   ├── {task-id}.md               # 任务详情（Markdown）
│   └── {task-id}.json             # 任务元数据
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
    path: string;                  // IPC socket/pipe 路径
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
  command: string;                 // ACP 版本的启动命令
  workDir: string;                 // 工作目录
  capabilities?: string[];         // 职责倾向（Worker 类型）
  autoClaimTags?: string[];        // 根据 tag 自动接取
  allowMultiProcess?: boolean;     // 是否允许创建多进程，默认 false
  promptTemplate?: string;         // Worker 启动 prompt 模板路径
}
```

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
| `{{artifacts.outputDir}}` | string | 产物输出目录绝对路径 |
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

## 5. Defaults & Overrides

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
