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
| Manager Agent | Node Core | ACP | 分发建议/状态监控 |
| 用户 | ClientCLI → Node Core | CLI (shell) → IPC | 手动管理操作 |
| Dashboard | Server | HTTP | 查看状态/创建任务 |

### 5. ACP 通信协议

**决策**：ClientNode 通过 ACP 管理 Agent 进程生命周期

**ACP 用途**：
- 启动 Agent 进程（指定命令行 + 工作目录 + prompt 模板）
- Manager Agent 与 Node Core 的双向消息通道
- 监控 Agent 进程健康状态（心跳/退出码）
- 优雅终止 Agent 进程

> **注意**：Worker 不通过 ACP 与 Node 通信。Worker 被 ACP 启动后，通过 CLI 命令与 Node 交互。ACP 仅用于进程生命周期管理和 Manager 的顾问通道。

### 6. IPC 通信 (CLI ↔ ClientNode)

**决策**：Named Pipe (Windows) / Unix Socket

**原因**：
- CLI 和 ClientNode 在同一机器
- 比 HTTP 更轻量
- 天然的本地进程间通信方案
- Worker 调用 CLI 命令时，CLI 内部通过 IPC 转发给 Node Core

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
   → 调用 `dispatch worker progress` 上报进度
   → CLI → IPC → Node Core → HTTP → Server 更新文件

5. [Worker] 完成任务 — 打包产物
   → 生成 artifact.zip + result.json
   → 调用 `dispatch worker complete <task-id> --zip <path> --result <path>`
   → CLI → IPC → Node Core 预校验 → HTTP 上传到 Server

6. [Server] 校验产物
   → 检查 zip + result.json 存在性、格式、必填字段
   → 校验通过 → 存储产物 → 状态: completed → 触发回调
   → 校验失败 → 状态: failed (ARTIFACT_* 错误)
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

## Anti-patterns

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

### Don't: Worker 通过 ACP 消息上报进度

**问题**：ACP 用于进程管理和 Manager 通道，不是 Worker 的通信协议

**正确做法**：Worker 调用 `dispatch worker` CLI 命令上报。ACP 仅用于启动/停止 Worker 进程。

### Don't: 阻塞操作队列

**问题**：一个慢操作会阻塞后续所有操作

**正确做法**：文件 I/O 异步执行，操作本身应快速完成

### Don't: 硬编码 Agent 启动命令

**问题**：不同用户使用不同的 AI 工具

**正确做法**：Agent 启动命令由配置文件指定
