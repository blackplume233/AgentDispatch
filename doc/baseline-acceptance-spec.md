# AgentDispatch 验收规范（Baseline v1）

> 本文定义“可交付”的统一标准，用于里程碑验收、PR Gate、发布准入。

## 1. 通用验收门禁（所有里程碑必须满足）

1. Spec 一致性
- 任何接口/配置变更先更新 `spec/api-contracts.md` 与 `spec/config-spec.md`。
- 代码实现与 spec 不一致时，默认视为不通过。

2. 代码质量
- TypeScript strict 无错误。
- `lint/test/build` 全部通过。
- 无未解释的 `any`、`ts-ignore`。

3. 测试基线
- 新增功能必须包含单元测试。
- 关键链路必须包含至少 1 个集成或黑盒测试。
- 回归测试无阻断失败。

4. 可观测性
- 关键业务路径有结构化日志（JSONL）。
- 日志可通过 `taskId/clientId/agentId/requestId` 追踪。

5. 文档与可运维
- README 或模块文档可指导本地启动。
- 故障场景有最小恢复说明（至少包括重启与回滚步骤）。

6. 跨平台兼容性 [CHANGED 2026-02-28]
- 所有产物必须在 Linux / macOS / Windows 三端可构建、可测试、可运行。
- CI 矩阵必须包含 `ubuntu-latest`、`macos-latest`、`windows-latest`。
- 路径操作使用 `path.join()` / `path.resolve()`，禁止硬编码分隔符。
- IPC 通信自动适配 Named Pipe (Windows) / Unix Domain Socket (Linux/macOS)。
- 进程管理使用 Node.js API，不依赖平台特定 shell 命令。

## 2. 分里程碑验收标准

### M0 工程基线

必过项：
- `pnpm -r build` 通过。
- `pnpm -r test` 通过。
- `pnpm -r lint` 通过。
- CI 对主分支启用三门禁。
- CI 矩阵覆盖 Linux / macOS / Windows，三平台全绿。

### M1 Server MVP

必过项：
- Task/Client 核心 API 可用，状态码与错误码符合 spec。
- 文件持久化使用原子写，异常中断不损坏现有数据。
- 任务状态机受控，不允许非法迁移。

建议覆盖：
- 并发创建/申领在队列串行下结果可预期。
- 心跳超时后 client 状态变化可观测。

### M2 ClientNode + CLI MVP

必过项：
- CLI 能启动/停止/查询 Node。
- Node 能向 Server 注册并持续心跳。
- IPC 异常时返回可识别错误码。

### M3 Worker 执行闭环

必过项：
- Worker 可上报进度并完成任务。
- `artifact.zip` 和 `result.json` 缺失/非法时被拒绝并标记失败。
- `result.json.taskId` 必须与任务 ID 一致。

### M4 分发引擎 V1

必过项：
- `manager`、`tag-auto`、`hybrid` 三模式均有通过用例。
- `tag-auto` 规则按 `priority` 降序匹配。
- Worker 异常后任务可释放或重派，不出现僵尸占用。

### M5 Dashboard MVP

必过项：
- 任务看板、任务详情、Client 列表/详情可访问。
- 关键操作失败时有可见错误提示。
- 页面轮询不会造成明显卡顿或错误泛滥。

### M6 稳定化发布

必过项：
- 发布候选版本回归通过。
- 日志留存与清理策略生效。
- 提供发布与回滚说明。

## 3. 测试矩阵（基线）

| 测试类型 | 覆盖对象 | 通过标准 |
|---|---|---|
| 单元测试 | 服务层、分发规则、模板引擎、校验器 | 核心逻辑与边界条件通过 |
| 集成测试 | REST API、IPC、文件落盘 | 跨组件交互符合契约 |
| 黑盒测试 | 端到端任务生命周期 | 主链路与失败链路均可复现 |
| 回归测试 | 历史缺陷与关键路径 | 无 P0/P1 回归 |

## 4. 缺陷分级与发布准入

| 级别 | 定义 | 发布策略 |
|---|---|---|
| P0 | 核心链路不可用/数据损坏风险 | 阻断发布 |
| P1 | 关键功能不可用但有临时绕行 | 默认阻断，需负责人豁免 |
| P2 | 次要功能异常 | 可发布但需登记修复计划 |
| P3 | 文案/低影响问题 | 可发布，纳入迭代修复 |

## 5. 交付清单模板（每次验收提交）

- 版本号与提交范围
- 变更摘要（含 spec 变更项）
- 测试结果摘要（单元/集成/黑盒/回归）
- 已知问题清单（按 P0-P3）
- 风险与回滚方案
