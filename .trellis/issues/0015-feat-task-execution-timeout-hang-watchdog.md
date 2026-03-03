---
id: 15
title: "feat(client-node,server): 任务执行超时检测 — Hang Watchdog（第五层防御）"
status: open
labels:
  - enhancement
  - bug
  - "priority:P1"
milestone: null
author: human
assignees: []
relatedIssues:
  - 13
relatedFiles:
  - packages/client-node/src/node.ts
  - packages/server/src/services/client-service.ts
  - packages/shared/src/types.ts
taskRef: null
githubRef: "blackplume233/AgentDispatch#15"
closedAs: null
createdAt: 2026-03-03T00:40:00
updatedAt: 2026-03-03T00:40:00
closedAt: null
---

## 背景

#13 引入的四层防御机制有效解决了 Worker **崩溃**后任务变孤儿的问题。但实际运行中发现了一类新场景：**Worker 进程存活但完全不推进任务**（hang/卡死），四层防御均无法覆盖。

### 复现场景（2026-03-03 实测）

1. 提交 2 个简单 echo 测试任务（tag: `km`, `code`），由 `code-km-p4` OpenCode ACP Worker 认领
2. Worker 进程存活（PID 可查，内存 ~49MB），但 CPU 使用率为 0
3. progressMessage 停留在 `"write (in_progress)"` **持续 10+ 分钟**无变化
4. 手动杀掉 Worker 进程后，Client Node 正确检测到崩溃并重启新 Worker → **Layer 1 自愈生效**
5. 新 Worker 接手后，同样很快又卡在 `"write (in_progress)"` 不动

### 为什么四层防御无法覆盖

| 防御层 | 触发条件 | 为何不适用 |
|--------|---------|-----------|
| **Layer 1 — Client 自愈** | Worker 进程 exit/crash | Worker 进程仍存活，未退出 |
| **Layer 2 — 熔断器** | 同一 task 被 claim ≥3 次 | 任务仅被 claim 1 次，Worker 未释放 |
| **Layer 3 — 孤儿对账** | Client 注册/重连时 | Client 正常在线，未重连 |
| **Layer 4 — Server 交叉校验** | Agent 上报的 currentTaskId ≠ task.claimedBy | Agent 确实在 busy 状态且 taskId 一致 |

## 需求

增加 **Layer 5 — Task Execution Timeout（Hang Watchdog）** 作为最后一道防线。

### 方案设计

#### 5.1 Client-side Watchdog（推荐，更快响应）

在 `ClientNode` 中增加任务执行时间跟踪：

```typescript
// 新增配置项
interface ClientConfig {
  taskTimeout?: {
    maxExecutionMs?: number;       // 单任务最大执行时间，默认 30 分钟
    progressStaleMs?: number;      // progress 无更新判定为 stale，默认 10 分钟
    checkIntervalMs?: number;      // 检查间隔，默认 60 秒
  };
}
```

- 每个 in_progress 任务记录 `lastProgressUpdate` 时间戳
- 定时检查：如果 `now - lastProgressUpdate > progressStaleMs`，判定为 hang
- Hang 处理：先尝试 kill Worker 进程触发 Layer 1 自愈；如果 kill 失败，直接调用 `cancel` API

#### 5.2 Server-side Timeout（兜底）

在 `checkHeartbeats` 的 `crossValidateOnlineClients` 中增加超时检查：

```typescript
// 在 crossValidateOnlineClients 中，对于 agentReportsTaskId === task.id 的情况
// 增加判断：如果 task.updatedAt 距今超过 maxExecutionMs，force-release
const lastUpdate = new Date(task.updatedAt).getTime();
if (now - lastUpdate > serverTaskTimeout) {
  await this.taskService.forceReleaseTask(task.id, clientId, reason);
}
```

#### 5.3 配置项

| 配置项 | 位置 | 默认值 | 说明 |
|--------|------|--------|------|
| `taskTimeout.maxExecutionMs` | client.config.json | `1800000` (30min) | 单任务绝对超时 |
| `taskTimeout.progressStaleMs` | client.config.json | `600000` (10min) | 进度停滞超时 |
| `taskTimeout.checkIntervalMs` | client.config.json | `60000` (1min) | 检查间隔 |
| `taskTimeout.maxExecutionMs` | server.config.json | `3600000` (60min) | 服务端兜底超时（应大于客户端） |

### 关键约束

1. **Client 优先，Server 兜底**：Client-side watchdog 响应快（~1min），Server-side 作为最终保障（~60min）
2. **区分 stale vs slow**：依据 `progressMessage` 或 `updatedAt` 变化判断，而非简单的绝对时间。长时间任务只要有进度更新就不应被超时
3. **可配置豁免**：某些 capability（如 `ue-heavy`）的任务可能合理地需要更长时间，应支持 per-agent 超时覆盖
4. **超时后的任务状态**：超时 → force-release → 回到 pending → 可被重新 claim（配合 Layer 2 熔断器防止无限循环）
5. **日志与告警**：超时事件必须记录 client log（event: `task.timeout.stale_progress`）

## 涉及文件

- `packages/client-node/src/node.ts` — 新增 watchdog timer 和 hang 检测逻辑
- `packages/server/src/services/client-service.ts` — crossValidateOnlineClients 增加超时判断
- `packages/shared/src/types.ts` — ClientConfig 新增 `taskTimeout` 字段
- `packages/client-node/tests/unit/task-robustness.test.ts` — 新增超时相关测试

## 验收标准

- [ ] Worker 进程存活但 progress 停滞超过 `progressStaleMs` 时，Client 自动 kill Worker 并释放任务
- [ ] 任务执行超过 `maxExecutionMs` 时，Server 兜底 force-release
- [ ] 超时配置支持 per-agent 覆盖（`agents[].taskTimeout`）
- [ ] 超时释放的任务回到 pending 可被重新 claim
- [ ] 配合 Layer 2 熔断器，超时 ≥3 次的任务自动标记 `cancelled`
- [ ] 有进度更新的长时间任务不被误杀
- [ ] 新增单元测试覆盖 hang 检测、超时释放、误杀保护场景
- [ ] client log 记录超时事件

## 补充：测试中发现的其他观察

1. **OpenCode ACP Worker 特定行为**：`code-km-p4` 使用 OpenCode via ACP，频繁卡在 `"write (in_progress)"` 状态。可能是 LLM 请求超时或 ACP stdio 管道阻塞。需要 Worker Manager 层面增加 ACP 连接健康检查。
2. **之前残留了 13 个 claude-agent-acp 孤儿进程**：Client Node 退出时未正确清理子进程。`GRACEFUL_STOP_TIMEOUT (10s)` 可能不足以等待所有 Worker 退出，建议增加 force-kill 兜底。
