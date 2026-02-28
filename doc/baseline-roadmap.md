# AgentDispatch 基准 Roadmap（Baseline v1）

> 目标：用最小可用路径在 8 周内完成可演示、可回归、可扩展的 AgentDispatch 基线版本。
> 原则：Spec First、TDD、可观测、可回滚。

## 1. 里程碑总览

| 里程碑 | 周期 | 目标结果 | 退出条件 | 版本 |
|---|---|---|---|---|
| M0 - 工程基线 | Week 1 | Monorepo + 质量门禁可用 | 全仓可构建/可测试/可 lint | — |
| M1 - Server MVP | Week 2-3 | Task/Client 核心 API + 文件持久化 | 任务主流程接口稳定 | v1.0-alpha |
| M2 - ClientNode + CLI MVP | Week 4 | 节点可注册、心跳、IPC 控制 | CLI 能稳定驱动 Node | — |
| M3 - Worker 执行闭环 | Week 5 | Worker 进度/完成/失败链路打通 | 产物提交与校验生效 | **v1.0** |
| M4 - 分发引擎 V1 | Week 6 | tag-auto / manager / hybrid 基线可跑 | 三种模式至少各 1 条用例通过 | **v1.5** |
| M5 - Dashboard MVP | Week 7 | 任务/节点可视化管理 | 关键页面可操作、可刷新 | — |
| M6 - 稳定化与发布基线 | Week 8 | 日志审计、容错、文档、交付包 | 回归全绿，满足发布门槛 | **v2.0** |

> 详细任务清单与验收标准见 [.trellis/roadmap.md](../.trellis/roadmap.md)。

## 2. 分阶段计划

### M0 - 工程基线（Week 1）

- 建立 `pnpm workspace` 与 `packages/{server,client-node,client-cli,dashboard,shared}`。
- 完成 TypeScript strict、ESLint、Prettier、Vitest、tsup/tsx 配置。
- 建立 CI 流程（build/test/lint 三门禁）。
- 对齐 `.trellis/spec/*` 的入口与开发流程。

交付物：
- 根级脚手架与 5 个 package 最小可运行模板。
- CI 配置与 README 开发指引。

### M1 - Server MVP（Week 2-3）

- `OperationQueue`（单线程串行写）与 `FileStore`（Write->Rename 原子写）。
- Task API：create/list/get/claim/release/progress/complete/cancel。
- Client API：register/list/get/heartbeat/unregister。
- 错误码、状态机与 `api-contracts.md` 对齐。

交付物：
- Server 单元测试 + 集成测试基线。
- 数据落盘结构（tasks/clients/artifacts/logs）可验证。

### M2 - ClientNode + CLI MVP（Week 4）

- ClientNode：注册/心跳、任务轮询、IPC server。
- ClientCLI：`dispatch start|stop|status|register` + agent/task 基础命令。
- 打通 CLI -> IPC -> Node -> Server 通路。

交付物：
- CLI 可控 Node 生命周期。
- 节点在线/离线状态可被 Server 正确识别。

### M3 - Worker 执行闭环（Week 5）

- Worker 专用命令：`progress/complete/fail/status/log/heartbeat`。
- `artifact.zip + result.json` 提交与校验。
- Worker prompt 模板变量替换、必填变量校验、默认模板接入。

交付物：
- 端到端主链路：create -> claim -> progress -> complete。
- 失败链路：缺 zip / 无效 JSON / taskId 不匹配可正确报错。

### M4 - 分发引擎 V1（Week 6）

- `dispatchMode`：`manager`、`tag-auto`、`hybrid`。
- `autoDispatch.rules` + `priority` 匹配逻辑。
- Worker 异常检测、任务释放、自动重启策略（基线能力）。

交付物：
- 三种模式可通过黑盒场景验证。
- 分发决策有审计日志可追踪。

### M5 - Dashboard MVP（Week 7）

- 页面：任务看板、任务详情、Client 列表、Client 详情、创建任务。
- 轮询刷新与基础筛选。
- 与 Server API 对齐，类型从 shared 复用。

交付物：
- 可演示 Dashboard MVP。
- 关键交互有组件测试覆盖。

### M6 - 稳定化与发布基线（Week 8）

- 日志与审计完善（HTTP、任务事件、Agent 事件）。
- NFR 验证：稳定性、恢复能力、可维护性。
- 回归测试、文档完善、版本发布流程打通。

交付物：
- 发布候选版本（RC）。
- 发布检查清单与回滚手册。

## 3. 风险与缓解

| 风险 | 影响 | 缓解策略 |
|---|---|---|
| 接口频繁变更导致联调反复 | 进度延迟 | 先改 spec，再改实现；接口变更强制评审 |
| Worker 产物不规范导致失败率高 | 任务闭环不稳定 | ClientNode 本地预校验 + 模板内强约束 |
| 文件持久化一致性问题 | 数据损坏 | 原子写、启动清理 tmp、关键路径集成测试 |
| 多模块并行开发冲突 | 合并成本高 | shared 契约优先，按里程碑冻结接口窗口 |

## 4. 版本定义

- Baseline v1.0：完成 M0-M3，具备端到端任务执行闭环。
- Baseline v1.5：完成 M4，具备三模式分发基线能力。
- Baseline v2.0：完成 M5-M6，具备可视化与发布质量。
