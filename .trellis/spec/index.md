# Specification Overview — AgentDispatch

> Documentation-first: spec > implementation. When spec and code disagree, spec wins.

## Project Summary

AgentDispatch 是一个 CS 架构的 **Agent 任务分发平台**，由四个核心模块组成：

| 模块 | 职责 | 技术要点 |
|------|------|----------|
| **Server** | 任务管理中枢，RESTful API | 队列单线程、Markdown/JSON 落盘 |
| **Dashboard** | Server 可视化看板 | React + shadcn/ui |
| **ClientNode** | 客户端服务，管理 Agent 集群 | ACP 协议、Manager(可选)/Worker 模式 |
| **ClientCLI** | ClientNode 的命令行控制器 | IPC 通信 |

### 核心设计原则

- **跨平台** — 所有产物必须在 Linux / macOS / Windows 三端可运行，禁止平台特定硬编码
- **TDD 驱动** — 每个功能必须先写测试
- **文件持久化** — 所有任务状态以 Markdown/JSON 文件落盘
- **全量操作日志** — **所有操作必须落盘记录**：AI 交互、任务生命周期事件、HTTP 调用（收发双向），客户端和服务器均执行
- **单线程队列** — Server 操作无需考虑高并发
- **ACP 通信** — Client 通过 `@agentclientprotocol/sdk` (JSON-RPC 2.0 over stdio) 管理 Agent 进程

## Structure

```
spec/
|-- index.md                        # This file — 项目概览
|-- config-spec.md                  # 配置规范（Server/Client/Agent）
|-- api-contracts.md                # 接口契约（REST API / CLI / IPC / 错误码）
|-- frontend/
|   \-- index.md                    # Dashboard 前端开发规范
|-- backend/
|   \-- index.md                    # Server + ClientNode 后端开发规范
\-- guides/
    |-- index.md                    # 思考指南索引
    |-- architecture-guide.md       # 系统架构指南
    |-- cross-layer-thinking-guide.md
    \-- code-reuse-thinking-guide.md
```

## System Architecture

```
┌────────────────────────────────────────────────────┐
│                    Server                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │ REST API │  │ TaskQueue │  │ FileStore (.md)  │ │
│  └────┬─────┘  └────┬─────┘  └────────┬─────────┘ │
│       └──────────────┴─────────────────┘           │
└────────────────────┬───────────────────────────────┘
                     │ HTTP
┌────────────────────┼───────────────────────────────┐
│   Dashboard        │                               │
│   (React+shadcn)   │                               │
└────────────────────┘
                     │ HTTP (polling)
┌────────────────────┼───────────────────────────────┐
│              ClientNode                             │
│  ┌──────────┐  ┌────────────┐  ┌────────────────┐ │
│  │ Manager? │  │ Worker × N │  │ ACP Controller │ │
│  │(advisory)│  │ (Agents)   │  │ + TagDispatcher│ │
│  └─────┬────┘  └─────┬──────┘  └────────────────┘ │
│    ACP │          CLI ▲ (Worker 通过 CLI 上报)      │
│        ▼              │                            │
│  ┌─────────────────────────┐                       │
│  │      ClientNode Core    │ ←── IPC ──┐           │
│  └─────────────────────────┘           │           │
│                                   ┌────┴─────┐     │
│                                   │ClientCLI │     │
│                                   └──────────┘     │
└────────────────────────────────────────────────────┘
```

## Module Responsibilities

### Server
- 任务生命周期管理：创建 → 申领 → 进度更新 → 关闭 → 关闭回调
- Client 注册与管理
- 所有操作通过内部队列串行执行
- 任务数据以 Markdown/JSON 文件实时持久化

### Dashboard
- 任务看板：按状态分列显示（待办/进行中/已完成）
- 任务详情：进度、日志、Worker 信息
- Client 节点状态：在线/离线、Agent 列表、负载
- 基于 shadcn/ui 组件库

### ClientNode
- 注册到 Server，维持心跳
- **所有 Server 通信由 ClientNode Core 统一处理**
- **两种任务分发模式**（可共存）：
  - **Manager 模式**（可选）：Manager Agent 通过 ACP 为 Node 提供分发建议和状态监控
  - **Tag 自动分发模式**：程序根据 tag 匹配规则自动分配
- **Worker 通过调用 CLI 与 ClientNode 通信**（进度上报、产物提交、状态查询）
- Worker Agent：执行具体任务，通过 CLI 实时上报进度和提交产物
- 以固定间隔轮询 Server 任务列表
- Worker 异常中断时释放任务或启动新 Worker
- 通过 ACP 启动/停止 Agent 进程

### ClientCLI
- 通过 IPC 控制 ClientNode
- **既是用户操控工具，也是 Worker Agent 的通信通道**
- 所有 ClientNode 功能的命令行映射
- Agent 注册/注销/状态查询
- Worker 专用命令：进度上报、产物提交、任务状态查询
- 任务手动管理

## Principles

1. **Spec is the source of truth** — When implementation diverges from spec, fix the implementation (or update spec with rationale)
2. **Update spec first** — Before changing APIs, config, or interfaces, update the spec document
3. **Keep it current** — After every feature/fix that changes behavior, sync the spec
4. **TDD first** — 先写测试，再写实现
5. **Git workflow** — 遵循 conventional commits，功能分支开发
6. **Cross-platform** — 所有产物必须在 Linux / macOS / Windows 上可构建、可测试、可运行（详见 `backend/index.md` § Cross-Platform）

> **⚠️ 接口/契约变更规则 (CRITICAL)**
>
> 接口（REST API、IPC 协议、ACP 消息格式）和契约（DTO、类型定义、错误码、配置 Schema）是系统各模块之间的**刚性约定**。任何变更都必须遵循以下流程：
>
> 1. **先评估影响范围** — 列出所有受影响的模块和消费方
> 2. **先改 Spec 再改代码** — 在 `api-contracts.md` / `config-spec.md` 中更新，并在变更处标注 `[BREAKING]` 或 `[CHANGED]`
> 3. **Commit 消息必须标注** — 使用 `feat(api)!:` (breaking) 或 `feat(api):` (兼容) 前缀
> 4. **同步更新所有消费方测试** — 接口变更后所有相关测试必须同步调整
>
> 绝不允许"先改代码再补 Spec"或"Spec 和实现不一致"的状态存在。

## How to Use

- Before coding: read the relevant spec docs
- **Before changing any interface**: read `api-contracts.md` + `config-spec.md`, evaluate impact, update spec FIRST
- After coding: verify your changes match the spec; update if needed
- During review: check spec compliance, **especially interface changes**
