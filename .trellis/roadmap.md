# Product Roadmap — AgentDispatch

---

## Phase 0: 项目脚手架 (Foundation)

> 目标：搭建 Monorepo 结构、基础工具链、CI

- [ ] 初始化 pnpm workspace monorepo
- [ ] 创建 `packages/` 目录结构 (server, client-node, client-cli, dashboard, shared)
- [ ] 配置 TypeScript (strict mode, path aliases)
- [ ] 配置 ESLint + Prettier
- [ ] 配置 Vitest
- [ ] 配置 tsup / tsx 编译
- [ ] 编写 README.md

---

## Phase 1: Server Core (MVP)

> 目标：Server 可独立运行，提供完整 Task CRUD + 文件持久化

- [ ] **shared**: 公共类型定义 (Task, Client, Agent, Error)
- [ ] **shared**: 统一错误类层级
- [ ] **server**: 操作队列 (OperationQueue) + 单元测试
- [ ] **server**: 文件持久化层 (FileStore) + 单元测试
- [ ] **server**: TaskService (CRUD + 状态机) + 单元测试
- [ ] **server**: REST API 路由 (/tasks) + 集成测试
- [ ] **server**: ClientService (注册/心跳/状态) + 单元测试
- [ ] **server**: REST API 路由 (/clients) + 集成测试
- [ ] **server**: 心跳超时检测
- [ ] **server**: 任务关闭回调
- [ ] 黑盒测试：通过 API 完成完整任务生命周期

---

## Phase 2: ClientNode + CLI

> 目标：Client 可注册到 Server，CLI 可控制 ClientNode

- [ ] **client-node**: IPC Server (Named Pipe / Unix Socket)
- [ ] **client-cli**: IPC Client + 命令框架
- [ ] **client-node**: Server 注册 + 心跳上报
- [ ] **client-node**: 任务列表轮询器 (TaskPoller)
- [ ] **client-cli**: 节点管理命令 (start/stop/status/register)
- [ ] **client-cli**: 配置管理命令
- [ ] 黑盒测试：CLI 启动 Client → 注册到 Server → 心跳正常

---

## Phase 3: Agent 管理 (ACP)

> 目标：Agent 可通过 ACP 启动和通信

- [ ] **client-node**: ACP Controller (Agent 进程管理)
- [ ] **client-node**: Agent 注册/注销
- [ ] **client-node**: Manager Agent 默认模板（可选，manager/hybrid 模式使用）
- [ ] **client-node**: Worker prompt 模板系统
- [ ] **client-cli**: Agent 管理命令 (add/remove/list/status/restart)
- [ ] 黑盒测试：注册 Agent → 启动 → 通信 → 停止

---

## Phase 4: 任务分发引擎

> 目标：支持 manager / tag-auto / hybrid 三种分发模式

- [ ] **client-node**: dispatchMode 分发策略统一入口 (Dispatcher)
- [ ] **client-node**: Tag 匹配引擎 (TagMatcher) — tag-auto 模式核心
- [ ] **client-node**: Manager Agent 任务领取逻辑 — manager 模式核心
- [ ] **client-node**: Hybrid 模式（Manager 优先 → tag 规则兜底）
- [ ] **client-node**: autoDispatch.rules 配置解析 + 优先级排序
- [ ] **client-node**: Worker 进度实时上报
- [ ] **client-node**: Worker 异常检测 + 任务释放
- [ ] **client-node**: Worker 异常后自动重启
- [ ] **server**: 进度上报 API + 文件更新
- [ ] 黑盒测试 A：tag-auto 模式 — 创建任务 → tag 匹配 → Worker 自动执行 → 完成
- [ ] 黑盒测试 B：manager 模式 — 创建任务 → Manager 领取分发 → Worker 执行 → 完成

---

## Phase 5: Dashboard

> 目标：可视化管理界面

- [ ] **dashboard**: Vite + React + shadcn/ui 脚手架
- [ ] **dashboard**: 布局框架 (Sidebar + Header)
- [ ] **dashboard**: 任务看板 (Kanban Board)
- [ ] **dashboard**: 任务详情页
- [ ] **dashboard**: 任务创建对话框
- [ ] **dashboard**: Client 列表 + 状态显示
- [ ] **dashboard**: Client 详情 (Agent 列表/负载)
- [ ] **dashboard**: 自动轮询刷新

---

## Phase 6: 打磨 & 扩展

> 目标：生产可用

- [ ] 外部 Agent 辅助管理 Skill
- [ ] Manager Agent 可选模板（Claude / Cursor / 自定义）
- [ ] 任务优先级调度
- [ ] 批量任务操作
- [ ] Dashboard 日志实时流
- [ ] 完善错误恢复机制
- [ ] 性能优化（大量任务文件场景）
- [ ] 文档完善

---

## Current Focus

**Phase 0 — 项目脚手架**

当前需要完成 Monorepo 基础搭建和工具链配置。

---

> Keep this aligned with GitHub Issues and active Tasks.
> Update when starting/completing tasks or reprioritizing.
