# AgentDispatch 技术框架（Baseline v1）

> 本文给出基线技术架构、分层设计、关键组件职责与工程约束。

## 1. 总体架构

采用 Monorepo + CS 分布式节点架构：

- `Server`：任务与客户端中心、REST API、状态持久化。
- `ClientNode`：节点运行时、分发策略执行、Agent 生命周期管理。
- `ClientCLI`：人类与 Worker 的统一命令通道（IPC 到 Node）。
- `Dashboard`：可视化管理界面。
- `shared`：跨模块类型、错误码、契约模型。

## 2. 技术选型（Baseline）

| 层 | 选型 | 说明 |
|---|---|---|
| 语言 | TypeScript (strict) | 强类型和跨包复用 |
| 包管理 | pnpm workspace | Monorepo 高效依赖管理 |
| Server 框架 | Fastify（推荐）或 Express | Fastify 更易获得性能和 schema 能力 |
| 测试 | Vitest | 单测与集成统一 |
| 前端 | React + Vite + shadcn/ui + Tailwind | 快速搭建可维护 UI |
| 构建 | tsup/tsx | 开发与构建效率平衡 |
| 通信 | REST + IPC（Named Pipe/Unix Socket）+ ACP | 分层清晰，职责隔离 |
| 存储 | 文件持久化（Markdown/JSON + JSONL） | 与项目规范一致 |

## 3. 分层与模块边界

### Server 分层

1. Route 层
- 参数校验、错误映射、请求响应编排。

2. Service 层
- 任务状态机、客户端管理、业务规则。

3. Queue 层
- 所有写操作串行化执行，避免竞态。

4. Store 层
- 文件读写、原子写、目录结构维护。

5. Audit/Log 层
- 结构化日志输出与轮转策略。

### ClientNode 分层

1. Node Core
- 统一处理与 Server 的交互。

2. Dispatch Engine
- `manager`/`tag-auto`/`hybrid` 决策与规则执行。

3. Agent Runtime
- ACP 启停 Agent，监控健康状态。

4. IPC Server
- 接收 CLI 命令并执行。

### ClientCLI 分层

1. Command 层
- 用户和 Worker 命令入口与参数处理。

2. IPC Client 层
- 标准请求/响应协议封装。

### Dashboard 分层

1. Feature UI（tasks/clients）
2. API Client 层
3. 状态管理层（TanStack Query）

## 4. 关键设计约束

1. Spec First
- 接口与配置变更必须先更改 spec 再改代码。

2. Task 闭环强约束
- 完成任务必须提交 `artifact.zip + result.json`。

3. 可追溯性
- Server 与 Client 均必须记录关键操作日志。

4. 文件一致性
- 所有关键持久化写入使用 Write->Rename 原子写。

5. 单一通信通道
- Worker 与外部系统交互只能通过 `dispatch worker` 命令组。

## 5. 运行时数据结构（基线）

Server `dataDir`：

- `tasks/{task-id}.md|json`
- `clients/{client-id}.json`
- `artifacts/{task-id}/artifact.zip|result.json`
- `logs/*.jsonl`

Client `workDir`：

- `logs/*.jsonl`
- `templates/worker-prompt.md`
- 运行态缓存与 IPC 文件

## 6. NFR（非功能需求）基线

1. 跨平台 [CHANGED 2026-02-28]
- 所有产物必须在 Linux / macOS / Windows 三端可构建、可测试、可运行。
- 路径、IPC、进程管理、文件系统操作全部使用平台无关 API。
- CI 矩阵覆盖三平台，任一平台失败即阻断合并。
- 详细编码规范见 `.trellis/spec/backend/index.md` § Cross-Platform。

2. 稳定性
- 节点/Worker 异常退出后可恢复，任务不丢失。

3. 可维护性
- 模块解耦、shared 契约统一、测试可复现。

4. 可观测性
- 关键链路可按 ID 关联追踪。

5. 性能（基线级）
- 在中等任务规模下（例如百级任务）可稳定执行，不出现明显阻塞。

## 7. 发布与演进策略

1. Baseline v1.0
- 先保证任务主链路可运行与可回归（M0-M3）。

2. Baseline v1.5
- 扩展分发模式与恢复能力（M4）。

3. Baseline v2.0
- 完成可视化与发布级质量（M5-M6）。

## 8. 推荐目录骨架（对齐 baseline）

```text
packages/
  server/
  client-node/
  client-cli/
  dashboard/
  shared/
doc/
  baseline-roadmap.md
  baseline-acceptance-spec.md
  baseline-technical-framework.md
.trellis/
  spec/
  tasks/
  workspace/
```
