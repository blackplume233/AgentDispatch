# Architecture Thinking Guide — AgentDispatch

> 在做架构决策前阅读本指南，确保理解系统全貌。

---

## 核心架构：CS 模式 + Agent 集群

```
                    ┌─────────┐
                    │ Server  │  单实例，单线程队列
                    │ (REST)  │  文件持久化
                    └────┬────┘
                         │ HTTP
          ┌──────────────┼──────────────┐
          │              │              │
    ┌─────┴─────┐  ┌────┴─────┐  ┌────┴─────┐
    │ Client A  │  │ Client B │  │ Client C │
    │ Manager+W │  │ Tag+W    │  │ Hybrid   │
    │ (manager) │  │(tag-auto)│  │ (hybrid) │
    └───────────┘  └──────────┘  └──────────┘
```

---

## 关键架构决策

### 1. 为什么用文件持久化而不是数据库？

**决策**：Markdown/JSON 文件落盘

**原因**：
- 人类和 AI Agent 都能直接读写 Markdown
- 无需额外的数据库服务依赖
- 单线程队列消除了并发写入问题
- Git 友好，可追踪历史变更

**约束**：
- 所有写操作必须通过操作队列
- 所有文件写入必须使用 **Write → fsync → Rename** 原子模式（写临时文件 → 刷盘 → 原子重命名），禁止直接覆写目标文件
- 启动时清理残留 `.tmp` 文件
- 不适合高并发场景（设计上就排除了）

### 2. 为什么是单线程队列？

**决策**：Server 所有写操作排队串行执行

**原因**：
- 避免文件系统的竞态条件
- 简化状态一致性保证
- 代码复杂度大幅降低
- 对于任务分发场景，吞吐量足够

**注意**：
- 读操作不需要排队（文件只读安全）
- 队列满时返回 503，客户端应重试

### 3. 任务分发模式 [CHANGED 2026-02-28]

**决策**：支持三种分发模式，Manager Agent 不再是必须的

| 模式 | Manager Agent | 分发逻辑 | 适用场景 |
|------|:------------:|----------|----------|
| `manager` | **必须** | Manager AI 智能决策 | 复杂任务、需要上下文理解 |
| `tag-auto` | **不需要** | 程序按 tag 规则自动匹配 | 简单明确的任务、批量处理 |
| `hybrid` | **可选** | Manager 优先 → tag 规则兜底 | 混合场景 |

**Manager 的角色 — 辅助顾问，不是中转站** [CHANGED 2026-02-28]：

Manager Agent 通过 ACP 与 ClientNode Core 通信，职责**仅限于**：
- 为 Node 提供任务分发建议（接不接、分给谁）
- 监控 Worker 整体状态，提出调度建议
- **不中转** Worker 的通信，不代替 Node 调用 Server API

**Tag-auto 模式 — 程序分发流程**：
1. ClientNode 轮询发现 pending 任务
2. 按 `autoDispatch.rules` 优先级依次匹配任务 tag
3. 找到匹配 → 检查目标 Worker 是否空闲 → 申领 + 分发
4. 无匹配 → fallbackAction（skip 跳过 / queue-local 本地排队）

**Worker 职责与通信方式**（所有模式通用） [CHANGED 2026-02-28]：
- 接收并执行具体任务
- **通过调用 `dispatch worker` CLI 命令**与 ClientNode 通信
- 进度上报：`dispatch worker progress <task-id> --percent 50`
- 提交产物：`dispatch worker complete <task-id> --zip <path> --result <path>`
- 报告失败：`dispatch worker fail <task-id> --reason "..."`
- Worker 不直接调用 Server API，不通过 Manager 中转

### 4. 通信拓扑 [CHANGED 2026-02-28]

```
┌─────────────────── ClientNode 进程边界 ──────────────────┐
│                                                          │
│  ┌──────────────────────────┐                            │
│  │    ClientNode Core       │──── HTTP ──→ Server        │
│  │  (任务管理/Server通信)    │                            │
│  └──────┬──────────┬────────┘                            │
│     ACP │      IPC │                                     │
│         ▼          ▼                                     │
│  ┌──────────┐  ┌──────────┐                              │
│  │ Manager? │  │   CLI    │ ←── shell 调用 ── Worker     │
│  │(advisory)│  │(IPC接入) │ ←── shell 调用 ── 用户       │
│  └──────────┘  └──────────┘                              │
└──────────────────────────────────────────────────────────┘
```

**关键通信路径**：

| 发起方 | 接收方 | 协议 | 用途 |
|--------|--------|------|------|
| ClientNode Core | Server | HTTP | 任务申领/完成/进度转发/心跳 |
| Worker Agent | ClientCLI → Node Core | CLI (shell) → IPC | 进度上报/产物提交/状态查询 |
| ClientNode Core | Worker/Manager Agent | ACP (stdio ndjson, JSON-RPC 2.0) | prompt 投递/session 管理 |
| Manager Agent | Node Core | ACP (`session/prompt` ↔ `PromptResponse`) | 分发建议/状态监控 |
| 用户 | ClientCLI → Node Core | CLI (shell) → IPC | 手动管理操作 |
| Dashboard | Server | HTTP | 查看状态/创建任务 |

### 5. ACP 通信协议 [CHANGED 2026-02-28]

> 官方文档：https://agentclientprotocol.com

**决策**：使用 `@agentclientprotocol/sdk` v0.14.x 实现 ClientNode ↔ Agent 通信

**ACP 协议关键特征** (来自官方 Architecture 页)：
- 基于 **JSON-RPC 2.0**，消息 UTF-8 编码
- **stdio 传输**：Client 启动 Agent 子进程，通过 stdin/stdout 交换**换行符分隔的 JSON-RPC 消息**
- Agent stderr 可用于日志（Client 可捕获/转发/忽略）
- **一个连接可支持多个并发 session**
- 大量使用 **JSON-RPC notifications** 实现实时流式更新
- **双向请求**：Agent 可向 Client 发起请求（如文件读写、终端操作、权限申请）

**ClientNode 角色 = ACP Client**，职责：
- 启动 Agent 子进程，建立 ACP 连接
- 声明 ClientCapabilities (`fs.readTextFile`, `fs.writeTextFile`, `terminal`)
- 提供文件系统方法 (`fs/read_text_file`, `fs/write_text_file`)
- 提供终端方法 (`terminal/create`, `terminal/output`, `terminal/wait_for_exit`, `terminal/kill`, `terminal/release`)
- 处理 Agent 的权限请求 (`session/request_permission`)
- 接收 Agent 的通知 (`session/update`：消息流、tool calls、计划)
- 调用 `session/prompt` 投递任务、`session/cancel` 中断操作

**Worker/Manager Agent 角色 = ACP Agent**，通过 `AgentSideConnection` 响应。

**双通道模型**：Worker Agent 有两条通信通道：
1. **ACP 通道 (stdio)** — 任务 prompt 下发、Agent 消息流、文件系统、终端、tool calls、生命周期
2. **CLI 通道 (shell exec)** — AgentDispatch 特有的结构化任务操作 (`dispatch worker progress/complete/fail`)

> Worker 被 ACP 启动后，通过 CLI 命令（直接 shell exec 或 ACP terminal/create）与 Node 交互进行任务操作。
> ACP 提供标准化 Agent 能力（文件读写、终端执行、权限控制）；CLI 提供 AgentDispatch 特有的结构化操作。

### 6. IPC 通信 (CLI ↔ ClientNode)

**决策**：Named Pipe (Windows) / Unix Domain Socket (Linux/macOS)

**原因**：
- CLI 和 ClientNode 在同一机器
- 比 HTTP 更轻量
- 天然的本地进程间通信方案
- Worker 调用 CLI 命令时，CLI 内部通过 IPC 转发给 Node Core

**跨平台注意** [CHANGED 2026-02-28]：
- Node.js 的 `net.createServer()` + `net.connect()` 同时支持 Named Pipe 和 Unix Socket，统一使用此 API
- IPC 路径由配置自动适配平台（见 `config-spec.md` § IPC 路径平台默认值）
- 代码中**不做** `if (win32) { ... } else { ... }` 分支处理 IPC 连接逻辑，仅在路径生成时区分平台

### 6. 全量操作日志落盘

**决策**：Server 和 Client 所有操作无遗漏记录到日志文件

**原因**：
- AI Agent 行为不完全可预测，必须有据可查
- 任务跨越多个 Agent/Client 流转，需要完整审计链
- 问题排查依赖完整的操作时间线
- HTTP 调用记录是 Server/Client 之间的"通信证据"

**必须记录的内容**：
- 所有 HTTP 请求和响应（Server 入站 + Client 出站）
- 所有任务生命周期事件（创建/申领/分发/进度/完成/释放）
- 所有 AI Agent 交互（ACP 消息收发）
- 所有 IPC 命令（CLI 下发的操作）
- 所有异常事件（Agent 崩溃/心跳超时/队列满）

**不允许例外**：即使在调试模式下也不能关闭审计日志。`httpLog` 和 `auditLog` 配置项仅控制是否写入独立日志文件，主日志始终记录。

**格式**：JSON Lines (.jsonl)，按天轮转，便于 grep/jq 分析

---

## 数据流

### 任务完整生命周期

> Worker 通信方式在所有模式下都相同——调用 CLI。模式差异仅在**分发决策**环节。

**分发阶段 — Manager 模式** (`dispatchMode: 'manager'`)：

```
1. [Dashboard/API] 创建任务
   → Server 入队 → 写入文件 → 状态: pending

2. [ClientNode Core] 轮询发现新任务
   → 通过 ACP 咨询 Manager Agent
   → Manager 返回分发建议（接不接、分给哪个 Worker）
   → Node Core 调用 Server API 申领 → 状态: claimed

3. [ClientNode Core] 启动 Worker
   → ACP 启动 Worker 进程（使用 prompt 模板）
   → 状态: in_progress
```

**分发阶段 — Tag-auto 模式** (`dispatchMode: 'tag-auto'`)：

```
1. [Dashboard/API] 创建任务
   → Server 入队 → 写入文件 → 状态: pending

2. [ClientNode Core] 轮询发现新任务
   → 程序遍历 autoDispatch.rules 匹配 tag
   → 匹配成功 → 检查目标 Worker 空闲
   → Node Core 调用 Server API 申领 → 状态: claimed

3. [ClientNode Core] 启动 Worker
   → ACP 启动 Worker 进程（使用 prompt 模板）
   → 状态: in_progress
```

**执行与交付阶段**（所有模式统一） [CHANGED 2026-02-28]：

```
4. [Worker] 执行任务
   → ACP session/update 推送 tool_call / plan / message 事件
   → ClientNode 的 DispatchAcpClient 聚合流式 chunk 为完整消息记录日志
   → DispatchAcpClient 从事件中提取状态描述，调用 ProgressCallback
   → Node Core → HTTP → Server 更新进度 (message 字段为状态描述)
   → ⚠️ 首次 reportProgress 触发 claimed → in_progress 状态转换

5. [Worker] 完成任务 — ClientNode 自动收集产物
   → ACP session 结束（Worker 的 prompt 返回）
   → ClientNode handleTaskCompletion 扫描任务隔离 workDir
   → 自动 zip 全部文件 + 生成 result.json
   → HTTP 上传到 Server (completeTask)

6. [Server] 校验产物
   → 检查 zip + result.json 存在性、格式、必填字段
   → 校验通过 → 存储产物 → 状态: completed → 触发回调
   → 校验失败 → 状态: failed (ARTIFACT_* 错误)
```

**任务取消**（Dashboard / API 发起） [NEW 2026-02-28]：

```
1. [Dashboard/API] POST /tasks/:id/cancel
   → Server 标记任务 cancelled
2. [ClientNode] 或 IPC task.cancel 命令
   → 找到运行中的 Agent 进程 → kill
   → 清理 taskWorkDir
   → 通知 Server
```

**异常处理**（所有模式通用）：

```
6. [异常] Worker 中断
   → ClientNode 检测到进程退出
   → 释放任务（状态回 pending）或启动新 Worker 重试
```

### 轮询与心跳

```
ClientNode ──[heartbeat: 30s]──→ Server
ClientNode ──[polling: 10s]───→ Server /tasks?status=pending
Server ────[check: 15s]──────→ 标记超时 Client 为 offline
```

---

## 扩展点

### 自动分发规则

```
配置规则: tag 匹配 → 指定 Worker
示例:
  { taskTags: ["frontend"], targetCapabilities: ["react"] }
  { taskTags: ["urgent"], targetAgentId: "worker-dedicated" }
```

### Worker Prompt 模板

- 每个 ClientNode 可以自定义 Worker 的启动 prompt
- 模板支持变量替换（任务信息、Agent 配置等）
- 允许运行时修改，下次启动 Worker 生效

### Agent 类型扩展

- 当前：Manager + Worker
- 未来可能：Reviewer（代码审查）、Tester（测试执行）等

---

## QA 环境真实性要求 [NEW 2026-02-28]

> **⚠️ QA/测试环境的每个环节都必须使用真实组件，禁止用脚本模拟替代。**
>
> 这次 QA-fix 会话的核心教训：用 curl 模拟心跳、用 setTimeout 模拟进度、用空 zip 充当产物，
> 这些「看起来能跑通」的测试实际上验证不了任何真实问题。

### 真实 vs 模拟对照表

| 环节 | ❌ 模拟做法（禁止） | ✅ 真实做法（必须） |
|------|---------------------|---------------------|
| **Client 注册** | curl POST 注册 + 外部脚本发心跳 | 启动真实 `ClientNode` 进程，内置心跳 |
| **Worker 进程** | 主脚本 setTimeout 假装进度 | `AcpController.launchAgent()` 启动真实子进程 |
| **进度上报** | 主脚本直接调 `reportProgress` API | Worker 子进程调用 `dispatch worker progress` CLI |
| **任务完成** | 上传空 zip + 假 result.json | Worker 生成真实产物，通过 `dispatch worker complete` 提交 |
| **心跳检测** | curl 定时 POST | `ClientNode` 内置 heartbeat timer |
| **Tag 匹配** | 外部 Python 脚本轮询 + 匹配 | `Dispatcher` + `TagMatcher` 在 ClientNode 内运行 |
| **Worker 管理** | Map 记录 busy/idle | `WorkerManager` 跟踪进程生命周期、崩溃重启 |

### 为什么模拟不可接受

1. **进度来源错误** — 真实架构中进度由 Worker 子进程通过 CLI → IPC → Node → Server 链路上报。模拟时由主进程直接 HTTP 调用，跳过了 IPC 和 CLI 整条链路，无法验证通信是否正常
2. **产物为空** — 没有真实 Worker 就没有真实产出。空 zip + 假 result.json 能通过服务端验证，但 Dashboard 上展示的是空白内容，用户无法验证端到端流程
3. **生命周期缺失** — 模拟环境不会出现 Worker 崩溃、心跳超时、任务释放等真实场景，这些恰恰是最容易出 bug 的地方
4. **状态不一致** — 模拟脚本跟踪的 worker 状态（busy/idle）与 Server 上的 agent 状态是分离的，真实 `WorkerManager` 通过进程退出事件自动同步

### QA 环境启动检查清单

启动 QA 测试环境时，逐项确认：

- [ ] Server 进程真实运行（`pnpm dev` 或 `node dist/index.js`）
- [ ] Server 心跳检测已启动（`clientService.startHeartbeatCheck()`）
- [ ] ClientNode 是真实 `ClientNode` 实例（非 HTTP 注册 + 外部心跳）
- [ ] Worker 通过 `AcpController` 启动为子进程（非主进程内模拟）
- [ ] 进度通过 CLI → IPC 链路上报（非直接 HTTP 调用）
- [ ] 产物是 Worker 真实生成的文件（非空壳 zip）
- [ ] Dashboard 连接到同一个 Server 实例

---

## Anti-patterns

### Don't: 用模拟脚本替代真实组件做 QA 测试 [NEW 2026-02-28]

**问题**：
```
// 常见模拟手法 — 全部禁止
curl -X POST /api/v1/clients/register ...   // 不是真实 ClientNode
setInterval(() => fetch('/heartbeat'), 30000) // 不是真实心跳
setTimeout(() => reportProgress(50), 3000)    // 不是真实 Worker 进度
upload(emptyZip, fakeResult)                  // 不是真实产物
```

**为什么有害**：能让 HTTP 状态码全部返回 200，但完全跳过了 ClientNode → AcpController → Worker 子进程 → CLI → IPC → Node → Server 的完整链路。测出的"通过"毫无意义，真实链路上的 bug 一个也发现不了。

**正确做法**：启动完整的 `ClientNode` 实例 + 真实 Worker 子进程。详见上方 § QA 环境真实性要求。

### Don't: 直接文件写入（绕过队列）

**问题**：可能导致数据损坏

**正确做法**：所有写操作通过 `OperationQueue`

### Don't: Worker 直接调用 Server API

**问题**：绕过 ClientNode Core，导致状态不一致、日志缺失

**正确做法**：Worker 始终通过 CLI 命令与 ClientNode 通信
```
Worker → `dispatch worker progress/complete/fail` → CLI → IPC → Node Core → Server
```

### Don't: Worker 通过 Manager 中转通信

**问题**：增加不必要的复杂度，Manager 不是通信中枢

**正确做法**：Manager 仅是 Node 的顾问（分发建议 + 状态监控），Worker 直接通过 CLI 与 Node Core 通信

### Don't: Worker 通过 ACP `session/update` 上报任务进度

**问题**：ACP `session/update` 是通用 Agent 消息通知，不具备 AgentDispatch 的结构化任务操作语义（进度百分比、产物校验、状态机转换）

**正确做法**：Worker 调用 `dispatch worker` CLI 命令上报。ACP 用于 prompt 投递、session 管理、通用文件/终端能力。

### Don't: 自行实现 ACP 协议的 JSON-RPC 层

**问题**：增加维护成本，协议升级困难

**正确做法**：使用 `@agentclientprotocol/sdk` 的 `ClientSideConnection` / `AgentSideConnection`，SDK 负责消息序列化、方法路由、错误处理。

### Don't: 阻塞操作队列

**问题**：一个慢操作会阻塞后续所有操作

**正确做法**：文件 I/O 异步执行，操作本身应快速完成

### Don't: 硬编码 Agent 启动命令

**问题**：不同用户使用不同的 AI 工具

**正确做法**：Agent 启动命令由配置文件指定

### Don't: 使用平台特定 API 或路径 [CHANGED 2026-02-28]

**问题**：仅在开发者的 OS 上可运行，其他平台直接崩溃

**正确做法**：
- 路径使用 `path.join()` / `path.resolve()`
- IPC 路径通过配置层自动适配平台
- 进程信号使用 Node.js API 而非 shell 命令
- 详见 `backend/index.md` § Cross-Platform
