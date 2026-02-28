# Product Roadmap — AgentDispatch

> **目标**：8 周内完成可演示、可回归、可扩展的 AgentDispatch 基线版本。
> **原则**：Spec First、TDD、可观测、可回滚。

---

## 里程碑总览

| 里程碑 | 周期 | 目标结果 | 版本 |
|--------|------|----------|------|
| M0 - 工程基线 | Week 1 | Monorepo + 质量门禁可用 | — |
| M1 - Server MVP | Week 2-3 | Task/Client 核心 API + 文件持久化 | **v1.0-alpha** |
| M2 - ClientNode + CLI MVP | Week 4 | 节点可注册、心跳、IPC 控制 | |
| M3 - Worker 执行闭环 | Week 5 | Worker 进度/完成/失败链路打通 | **v1.0** |
| M4 - 分发引擎 V1 | Week 6 | tag-auto / manager / hybrid 基线可跑 | **v1.5** |
| M5 - Dashboard MVP | Week 7 | 任务/节点可视化管理 | |
| M6 - 稳定化与发布基线 | Week 8 | 日志审计、容错、文档、交付包 | **v2.0** |

---

## M0 — 工程基线 (Week 1)

> **目标**：搭建 Monorepo 结构、基础工具链、CI，所有 package 可独立构建和测试。

### 任务清单

- [ ] 初始化 pnpm workspace monorepo
- [ ] 创建 `packages/` 目录结构 (server, client-node, client-cli, dashboard, shared)
- [ ] 配置 TypeScript (strict mode, path aliases `@shared/*` 等)
- [ ] 配置 ESLint + Prettier
- [ ] 配置 Vitest (每个 package 独立配置)
- [ ] 配置 tsup / tsx 编译
- [ ] 建立 CI 流程 (build / test / lint 三门禁)
- [ ] 编写 README.md 开发指引
- [ ] 对齐 `.trellis/spec/*` 入口与开发流程

### 验收标准

**For Agent（自动化检查）**：

| 检查项 | 命令 | 通过条件 |
|--------|------|----------|
| 全仓构建 | `pnpm build` | exit code 0，所有 5 个 package 编译成功 |
| 全仓测试 | `pnpm test` | exit code 0，每个 package 至少 1 个 placeholder 测试通过 |
| 全仓 lint | `pnpm lint` | exit code 0，0 errors |
| 类型检查 | `pnpm type-check` | exit code 0，0 errors |
| 跨包引用 | shared 类型能被其他 package import | 编译不报错 |

**For Human（人工确认）**：

- [ ] 目录结构与 `spec/backend/index.md` 定义的 Monorepo 结构一致
- [ ] README.md 包含：项目简介、快速开始、开发命令、目录说明
- [ ] `git clone → pnpm install → pnpm build → pnpm test` 一键跑通

---

## M1 — Server MVP (Week 2-3)

> **目标**：Server 可独立运行，提供完整 Task CRUD + Client 管理 + 文件持久化。

### 任务清单

- [ ] **shared**: 公共类型定义 (Task, Client, Agent, AgentInfo, Error, DTO)
- [ ] **shared**: 统一错误类层级 (AppError / NotFoundError / ConflictError / ValidationError)
- [ ] **server**: OperationQueue (单线程串行写) + 单元测试
- [ ] **server**: FileStore (Write→fsync→Rename 原子写) + 单元测试
- [ ] **server**: TaskService (CRUD + 状态机) + 单元测试
- [ ] **server**: REST API 路由 /tasks (create/list/get/claim/release/progress/complete/cancel) + 集成测试
- [ ] **server**: ClientService (注册/心跳/状态/超时检测) + 单元测试
- [ ] **server**: REST API 路由 /clients (register/list/get/heartbeat/unregister) + 集成测试
- [ ] **server**: 心跳超时检测 (定时扫描, 标记 offline)
- [ ] **server**: 任务完成回调 (callbackUrl, 重试机制)
- [ ] **server**: HTTP 请求/响应日志中间件 (http-{date}.jsonl)
- [ ] **server**: 任务/Client 操作审计日志 (audit-{date}.jsonl)
- [ ] **server**: 启动时 .tmp 残留文件清理

### 验收标准

**For Agent（自动化检查）**：

| 检查项 | 方式 | 通过条件 |
|--------|------|----------|
| 单元测试 | `pnpm --filter server test` | 全绿，覆盖：OperationQueue / FileStore / TaskService / ClientService |
| 集成测试 | `pnpm --filter server test:integration` | 全绿，覆盖：所有 REST API 端点 |
| 状态机测试 | 单元测试 | 覆盖全部合法转换 + 全部非法转换拒绝 (TASK_INVALID_TRANSITION) |
| 错误码测试 | 集成测试 | 所有 `api-contracts.md` 定义的错误码至少 1 个测试用例覆盖 |
| 原子写入测试 | 单元测试 | 写入中途模拟崩溃后原文件不损坏 |
| 类型合规 | `pnpm type-check` | 0 errors, Task/Client 类型与 `api-contracts.md` 完全一致 |
| 数据落盘验证 | 集成测试 | 创建任务后 `{dataDir}/tasks/{id}.md` 和 `{id}.json` 文件存在且内容正确 |
| 日志验证 | 集成测试 | 每次 API 调用在 `http-{date}.jsonl` 中有对应记录 |

**For Human（人工确认）**：

- [ ] `pnpm --filter server start` 启动成功，监听端口可访问
- [ ] 用 curl/httpie 手动跑通完整任务生命周期：创建 → 申领 → 上报进度 → 提交产物 → 完成
- [ ] 检查 `{dataDir}/` 目录结构是否与 `config-spec.md` 一致
- [ ] 关闭 Server 后重启，数据不丢失（文件持久化验证）
- [ ] 注册 Client → 发心跳 → 停止心跳 → 确认被标记为 offline

**黑盒测试场景**：

```
场景 1: 任务主流程
  POST /tasks → 200, 状态: pending
  POST /tasks/:id/claim → 200, 状态: claimed
  POST /tasks/:id/progress → 200, progress: 50
  POST /tasks/:id/complete (zip + result.json) → 200, 状态: completed
  验证: 文件落盘, 审计日志, 回调触发

场景 2: 异常流
  POST /tasks/not-exist/claim → 404, TASK_NOT_FOUND
  POST /tasks/:id/claim (已被申领) → 409, TASK_ALREADY_CLAIMED
  POST /tasks/:id/complete (缺 zip) → 400, ARTIFACT_MISSING_ZIP
  POST /tasks/:id/complete (无效 JSON) → 400, ARTIFACT_INVALID_JSON
```

---

## M2 — ClientNode + CLI MVP (Week 4)

> **目标**：ClientNode 可注册到 Server，CLI 可控制 Node 生命周期，IPC 通路畅通。

### 任务清单

- [ ] **client-node**: IPC Server (Named Pipe on Windows / Unix Socket)
- [ ] **client-cli**: IPC Client + 命令框架 (commander/yargs)
- [ ] **client-node**: Server 注册 + 心跳上报
- [ ] **client-node**: TaskPoller (固定间隔轮询 Server 任务列表)
- [ ] **client-cli**: 节点管理命令 (`dispatch start/stop/status/register/unregister`)
- [ ] **client-cli**: 配置管理命令 (`dispatch config show/set/edit`)
- [ ] **client-node**: 出站 HTTP 请求/响应日志
- [ ] **client-node**: IPC 命令审计日志

### 验收标准

**For Agent（自动化检查）**：

| 检查项 | 方式 | 通过条件 |
|--------|------|----------|
| IPC 通信测试 | 单元测试 | CLI 发送命令 → Node 收到并响应 → CLI 收到结果 |
| 注册测试 | 集成测试 (Server + Node) | Node 注册后 Server `/clients` 能查到，状态为 online |
| 心跳测试 | 集成测试 | Node 心跳正常 → Server 显示 online；停止心跳 → Server 标记 offline |
| 轮询测试 | 单元测试 | TaskPoller 以配置间隔调用 Server API，返回任务列表 |
| CLI 命令测试 | 集成测试 | 所有 2.1 节点管理命令 + 2.5 配置命令返回预期结果 |

**For Human（人工确认）**：

- [ ] `dispatch start --config client.config.json` 启动 Node 成功
- [ ] `dispatch register --server http://localhost:9800` 注册成功
- [ ] `dispatch status` 显示：连接状态 online、Server URL、心跳时间
- [ ] Server Dashboard/API 能看到此 Client 的信息
- [ ] `dispatch stop` 优雅关闭，Server 侧 Client 最终标记为 offline

**黑盒测试场景**：

```
场景: Node 生命周期
  dispatch start → Node 启动, IPC 监听
  dispatch register --server http://... → 注册成功, Server 可见
  (等待 30s+) → 心跳正常
  dispatch stop → Node 关闭
  (等待 heartbeat timeout) → Server 标记 offline
```

---

## M3 — Worker 执行闭环 (Week 5)

> **目标**：Worker 可通过 ACP 启动、通过 CLI 通信、提交产物并校验。端到端任务执行链路完整。

### 任务清单

- [ ] **client-node**: ACP Controller (Agent 进程启动/停止/健康检查)
- [ ] **client-node**: Agent 注册/注销 (Manager 可选, Worker 必须)
- [ ] **client-node**: Prompt Template Engine (读取 md → 替换 {{变量}} → 传入 ACP)
- [ ] **client-node**: Worker prompt 默认模板接入
- [ ] **client-cli**: Agent 管理命令 (`dispatch agent add/remove/list/status/restart`)
- [ ] **client-cli**: Worker 专用命令 (`dispatch worker progress/complete/fail/status/log/heartbeat`)
- [ ] **client-node**: Worker CLI 命令 → IPC → Node Core → Server HTTP 转发链路
- [ ] **client-node**: 产物本地预校验 (zip 存在 + result.json 格式)
- [ ] **server**: 产物上传接口 (multipart) + 8 步校验逻辑

### 验收标准

**For Agent（自动化检查）**：

| 检查项 | 方式 | 通过条件 |
|--------|------|----------|
| ACP 进程管理 | 单元测试 | 启动进程 → 获取 PID → 健康检查 → 优雅停止 |
| Agent 注册 | 集成测试 | `dispatch agent add --type worker ...` → Agent 出现在列表中 |
| 模板拼装 | 单元测试 | 所有必填变量被替换，无残留 `{{...}}`，缺失变量产生警告 |
| Worker CLI 链路 | 集成测试 | `dispatch worker progress` → Node 收到 → Server 更新文件 |
| 产物校验 - 正常 | 集成测试 | 合法 zip + result.json → completed |
| 产物校验 - 缺 zip | 集成测试 | → ARTIFACT_MISSING_ZIP, 状态 failed |
| 产物校验 - 无效 JSON | 集成测试 | → ARTIFACT_INVALID_JSON, 状态 failed |
| 产物校验 - taskId 不匹配 | 集成测试 | → ARTIFACT_INVALID_JSON, 状态 failed |
| 产物校验 - hash 不匹配 | 集成测试 | → ARTIFACT_HASH_MISMATCH, 状态 failed |
| 端到端主链路 | E2E 测试 | Server + Node + MockWorker: create → claim → progress → complete |

**For Human（人工确认）**：

- [ ] `dispatch agent add --type worker --command "..." --workdir ./work` 注册 Worker
- [ ] Worker 被 ACP 启动后，能通过 `dispatch worker progress <task-id> --percent 50` 上报
- [ ] Worker 提交产物后，Server 中 `artifacts/{task-id}/` 目录存在 zip 和 result.json
- [ ] 查看 Worker prompt 模板拼装结果——确认任务信息、产物格式、CLI 命令参考完整可读
- [ ] 提交不规范产物（缺 zip / 错 JSON）→ 任务被正确标记为 failed

**黑盒测试场景**：

```
场景 1: 主链路（使用 Mock Worker 脚本）
  Server 创建任务 (tag: ["test"])
  CLI: dispatch task assign <task-id> <worker-id>
  Worker 脚本:
    dispatch worker progress <task-id> --percent 30 --message "working"
    (生成 zip + result.json)
    dispatch worker complete <task-id> --zip ./out/artifact.zip --result ./out/result.json
  验证: Server 任务状态 completed, artifacts 目录有文件, 审计日志完整

场景 2: 失败链路
  Worker 脚本:
    dispatch worker fail <task-id> --reason "dependency not found"
  验证: Server 任务状态 failed, 原因记录

场景 3: 产物校验失败
  Worker 提交空 result.json → ARTIFACT_INVALID_JSON
  Worker 提交不含 zip → ARTIFACT_MISSING_ZIP
  验证: 任务状态 failed, 错误码准确
```

### 里程碑标志

> **v1.0 — 端到端任务执行闭环达成**：从创建任务到提交产物校验通过的完整链路。

---

## M4 — 分发引擎 V1 (Week 6)

> **目标**：三种分发模式 (tag-auto / manager / hybrid) 基线可跑，Worker 异常可恢复。

### 任务清单

- [ ] **client-node**: Dispatcher (分发策略统一入口，按 dispatchMode 分流)
- [ ] **client-node**: TagMatcher (autoDispatch.rules 解析 + priority 排序 + tag 匹配)
- [ ] **client-node**: Manager Handler (ACP 顾问通道 — 接收分发建议)
- [ ] **client-node**: Hybrid 逻辑 (Manager 在线 → 咨询 Manager; 否则 → tag 规则兜底)
- [ ] **client-node**: Worker 异常检测 (进程退出码监控)
- [ ] **client-node**: 任务释放 (Worker 崩溃 → 释放任务回 pending)
- [ ] **client-node**: Worker 自动重启策略 (可配置重试次数)
- [ ] **server**: 进度上报 API + 文件更新优化
- [ ] **client-node**: 分发决策审计日志 (记录匹配过程和结果)

### 验收标准

**For Agent（自动化检查）**：

| 检查项 | 方式 | 通过条件 |
|--------|------|----------|
| TagMatcher | 单元测试 | 规则优先级排序正确；AND 逻辑匹配正确；无匹配返回 null |
| tag-auto 模式 | E2E 测试 | 创建 tag 匹配的任务 → 自动申领 → 分发给空闲 Worker |
| manager 模式 | E2E 测试 (mock Manager) | 轮询 → 咨询 Manager → Manager 返回建议 → Node 执行分发 |
| hybrid 模式 | E2E 测试 | Manager 在线: 走 Manager; Manager 离线: 走 tag 规则 |
| Worker 崩溃恢复 | 集成测试 | Worker 进程 kill → 任务释放回 pending (或自动重启) |
| fallbackAction | 单元测试 | skip: 跳过无匹配任务; queue-local: 本地排队 |
| 分发日志 | 集成测试 | 每次分发决策在 audit 日志中有完整记录 |

**For Human（人工确认）**：

- [ ] 配置 `dispatchMode: "tag-auto"` + 规则 → 创建匹配任务 → 自动被分发 → Worker 执行完成
- [ ] 配置 `dispatchMode: "manager"` → Manager Agent 启动 → 创建任务 → Manager 提供建议 → 分发执行
- [ ] 手动 kill Worker 进程 → 确认任务被释放回 pending 或新 Worker 被启动
- [ ] 查看审计日志 → 确认分发决策过程可追踪（匹配了哪条规则、选择了哪个 Worker）
- [ ] 创建不匹配任何规则的任务 → 确认 fallbackAction 行为正确

**黑盒测试场景**：

```
场景 A: tag-auto 模式
  配置: dispatchMode=tag-auto, rules=[{taskTags:["backend"], targetCapabilities:["node"]}]
  注册 Worker (capabilities: ["node"])
  创建任务 (tags: ["backend"])
  → Worker 自动被分发任务 → 执行 → 提交产物 → completed
  创建任务 (tags: ["frontend"])
  → 无匹配，fallbackAction 生效

场景 B: manager 模式
  配置: dispatchMode=manager
  注册 Manager Agent + Worker Agent
  创建任务 → Node 咨询 Manager → Manager 建议分发 → Worker 执行 → completed

场景 C: Worker 崩溃恢复
  Worker 正在执行任务 → kill Worker 进程
  → Node 检测到退出 → 释放任务 (状态回 pending) → 新 Worker 可重新申领
```

### 里程碑标志

> **v1.5 — 三模式分发基线能力达成**：tag-auto / manager / hybrid 各至少 1 条完整用例通过。

---

## M5 — Dashboard MVP (Week 7)

> **目标**：可视化管理界面，覆盖任务看板和节点监控。

### 任务清单

- [ ] **dashboard**: Vite + React + shadcn/ui + TanStack Query 脚手架
- [ ] **dashboard**: 布局框架 (Sidebar + Header + Layout)
- [ ] **dashboard**: 任务看板 (Kanban Board — pending/claimed/in_progress/completed 四列)
- [ ] **dashboard**: 任务详情页 (进度条、日志、产物下载、元数据)
- [ ] **dashboard**: 任务创建对话框 (title/description/tags/priority)
- [ ] **dashboard**: Client 列表页 (名称、状态、Agent 数、最后心跳)
- [ ] **dashboard**: Client 详情页 (Agent 列表、负载、当前任务)
- [ ] **dashboard**: 自动轮询刷新 (refetchInterval 对齐轮询间隔)
- [ ] **dashboard**: 组件测试 (Vitest + Testing Library)

### 验收标准

**For Agent（自动化检查）**：

| 检查项 | 方式 | 通过条件 |
|--------|------|----------|
| 构建 | `pnpm --filter dashboard build` | exit code 0，无 TypeScript 错误 |
| 组件测试 | `pnpm --filter dashboard test` | 关键交互覆盖：创建任务、看板拖拽/点击、状态筛选 |
| 类型安全 | 类型检查 | 所有 API 调用使用 `@shared` 类型，无 `any` |
| API 对齐 | 代码审查 | `src/api/` 中的端点与 `api-contracts.md` 一致 |

**For Human（人工确认）**：

- [ ] 打开浏览器 → 看板页面加载成功，显示当前任务分布
- [ ] 创建一个任务 → 看板自动刷新，新任务出现在 pending 列
- [ ] 在后台让 Worker 执行任务 → 看板上任务卡片自动流转到 completed
- [ ] 点击任务卡片 → 详情页显示进度、日志、产物信息
- [ ] 点击 Client 页面 → 显示所有注册节点、Agent 状态、在线/离线正确
- [ ] 刷新页面 → 状态不丢失

---

## M6 — 稳定化与发布基线 (Week 8)

> **目标**：日志审计完善、容错机制、文档收尾，达到发布质量。

### 任务清单

- [ ] 日志审计完善 (覆盖 `backend/index.md` 定义的所有必须记录的操作类型)
- [ ] NFR 验证：Server 启动恢复 (.tmp 清理 + 状态一致性)
- [ ] NFR 验证：Client 断线重连 + 心跳恢复
- [ ] NFR 验证：Worker 批量崩溃后任务全部释放
- [ ] 全量回归测试 (所有 E2E 场景重跑)
- [ ] API 文档生成 (可选: OpenAPI spec)
- [ ] 用户文档：安装、配置、快速开始、CLI 参考
- [ ] 发布检查清单 + 版本号管理
- [ ] 可选：性能基准测试 (100+ 任务文件并发读写)

### 验收标准

**For Agent（自动化检查）**：

| 检查项 | 方式 | 通过条件 |
|--------|------|----------|
| 全量回归 | `pnpm test` (全仓) | 全绿 |
| 日志覆盖率 | 脚本检查 | Server/Client 定义的所有必须记录事件类型在日志中有对应记录 |
| 崩溃恢复 | E2E 测试 | Server 重启后数据一致；Node 重启后自动重连 |
| 0 lint errors | `pnpm lint` | exit code 0 |
| 0 type errors | `pnpm type-check` | exit code 0 |

**For Human（人工确认）**：

- [ ] 按用户文档从零搭建环境 → 全程无阻断
- [ ] 完整演示流程：创建任务 → 自动分发 → Worker 执行 → Dashboard 可视化 → 产物下载
- [ ] 故障演示：kill Server → 重启 → 数据恢复正常
- [ ] 故障演示：kill Worker → 任务释放 → 新 Worker 接手
- [ ] 审计日志可查：任意一个任务的完整生命周期事件链可在日志中还原

### 里程碑标志

> **v2.0 — 发布基线达成**：可视化 + 发布质量 + 文档完整。

---

## 版本定义

| 版本 | 里程碑 | 能力 |
|------|--------|------|
| v1.0-alpha | M1 | Server 独立运行，API 可用 |
| **v1.0** | M0 + M1 + M2 + M3 | **端到端任务执行闭环**：创建 → 分发(手动) → Worker 执行 → 产物提交 → 校验 |
| **v1.5** | + M4 | **三模式自动分发**：tag-auto / manager / hybrid |
| **v2.0** | + M5 + M6 | **发布质量**：Dashboard 可视化 + 日志审计 + 容错 + 文档 |

---

## 风险与缓解

| 风险 | 影响 | 缓解策略 |
|------|------|----------|
| ACP 协议细节未定 | M3 卡住 | 先用最简实现(stdin/stdout)，后续可替换 |
| 接口频繁变更导致联调反复 | 进度延迟 | 先改 spec 再改实现；接口变更强制评审 + Change Log |
| Worker 产物不规范导致失败率高 | 闭环不稳定 | ClientNode 本地预校验 + prompt 模板强约束 |
| Manager Agent 依赖真实 AI 工具 | M4 manager 模式难测 | 先做 tag-auto 跑通全链路，manager 用 mock Agent |
| 文件持久化一致性问题 | 数据损坏 | Write→fsync→Rename + 启动清理 tmp + 集成测试 |
| 多模块并行开发冲突 | 合并成本高 | shared 契约优先，按里程碑冻结接口窗口 |

---

## Current Focus

**M0 — 工程基线**

当前需要完成 Monorepo 基础搭建和工具链配置。

---

> Keep this aligned with GitHub Issues and active Tasks.
> Update when starting/completing milestones or reprioritizing.
