## QA Loop 修复引导 — Round 3

目标：针对 `qa-loop` 新增场景中的高风险失败点，按最小改动完成修复并回归。

### P0: Server 输入与字段白名单

现象：
- `POST /clients/register` 缺失 `agents` 时返回 500（应为 400）。
- `PATCH /tasks/:id` 可覆盖 `id/status/createdAt` 等受保护字段，导致任务被篡改。

建议改动：
1. 在路由层增加请求体 schema（Fastify schema 或等价校验），对 DTO 做运行时验证。
2. `TaskService.updateTask()` 改为显式白名单赋值，只允许 `title/description/tags/priority/metadata`。
3. 拒绝 unknown fields，返回统一 `VALIDATION_ERROR`。

建议文件：
- `packages/server/src/routes/tasks.ts`
- `packages/server/src/routes/clients.ts`
- `packages/server/src/services/task-service.ts`

回归入口：
- `qa-loop-server-input-hardening`

---

### P0: Task Owner 约束（防止越权操作）

现象：
- 非认领方可以 release/progress/cancel 其他客户端任务，状态机会被外部篡改。

建议改动：
1. 在 `releaseTask/reportProgress/cancelTask/completeTask/failTask` 增加 owner 校验。
2. 对 `claimed` 与 `in_progress` 任务，要求 `clientId/agentId` 与 `task.claimedBy` 一致。
3. 越权时返回 403（建议新增 `FORBIDDEN`/`TASK_NOT_OWNER` 错误码）。

建议文件：
- `packages/server/src/services/task-service.ts`
- `packages/shared/src/errors/index.ts`
- `packages/shared/src/types/dto.ts`（补齐 complete/fail 等路径所需身份字段）

回归入口：
- `qa-loop-task-ownership-guard`

---

### P1: CLI/IPC 指令契约一致性

现象：
- `client-cli` 暴露的多条命令在 `client-node` 的 IPC switch 中没有 handler，运行时直接 `Unknown IPC command`。

建议改动：
1. 补全 `ClientNode.handleIPC()` 对 `agent.* / task.assign / task.release / worker.complete / worker.fail / worker.status / worker.log / worker.heartbeat` 的处理。
2. 对暂不支持的命令，不要抛 unknown；返回结构化错误（`NOT_IMPLEMENTED`）并带清晰消息。
3. 将 `node scripts/qa/check-ipc-command-parity.mjs` 加入 CI。

建议文件：
- `packages/client-node/src/node.ts`
- `packages/client-cli/src/commands/*.ts`
- `scripts/qa/check-ipc-command-parity.mjs`

回归入口：
- `qa-loop-cli-ipc-command-parity`

---

### 执行顺序建议

1. 先修 P0 输入校验与白名单（阻断数据污染）。
2. 再修 P0 owner 校验（阻断越权状态变更）。
3. 最后修 P1 CLI/IPC 契约（提升可用性与可维护性）。

每个阶段完成后执行：

```bash
pnpm test
node scripts/qa/check-ipc-command-parity.mjs
```

然后用 `/qa run <scenario>` 回归对应场景。
