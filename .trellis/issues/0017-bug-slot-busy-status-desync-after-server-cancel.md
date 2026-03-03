---
id: 17
title: "bug(client-node+server): server 取消/释放任务后 slot 忙碌状态不同步"
status: open
labels:
  - bug
  - "priority:P1"
milestone: null
author: jiahao
assignees: []
relatedIssues: [16]
relatedFiles:
  - packages/client-node/src/node.ts
  - packages/server/src/services/client-service.ts
taskRef: null
githubRef: null
closedAs: null
createdAt: 2026-03-03T01:00:00
updatedAt: 2026-03-03T01:00:00
closedAt: null
---

## 背景

当 admin 通过 server API 执行 `force-release` 或 `cancel` 操作后，client-node 的 worker manager 无法感知任务状态变化，继续通过 heartbeat 上报旧的 busy 状态。

## 复现

1. Worker slot 正在执行一个任务（status=busy, currentTaskId=xxx）
2. Admin 通过 `POST /api/v1/tasks/:id/force-release` 或 `cancel` 取消任务
3. Server 侧任务变为 `pending` 或 `cancelled`
4. Client-node 不知道，heartbeat 继续上报 slot 为 busy

## 现象

- Server 中 client 记录的 agent 状态显示 `busy`，但关联的任务已经是 `pending`/`cancelled`
- Dashboard 显示 slot 忙碌，实际已经没有有效任务在执行
- 如果使用 `force-release`（回到 pending），poller 会重新 claim 该任务，形成无限循环
- 必须手动杀进程才能恢复 slot 为 idle

## 根因

1. **client-node 缺少反向对账**：heartbeat 只发送状态，不校验 server 侧任务是否仍然有效
2. **server 缺少纠正逻辑**：收到 heartbeat 中 agent 声称的 `currentTaskId` 时，不校验该任务是否仍处于活跃状态

## 修复方案

### 1. Client 侧：`reconcileStaleWorkers()`（`node.ts`）

在 `doHeartbeat` 成功后调用：
- 遍历所有 busy worker
- 对每个 busy worker，向 server 查询其 `currentTaskId` 的任务状态
- 如果任务已是终态（cancelled/completed/failed）或不再属于本 client：
  - 停止对应 agent 进程
  - 回收 worker token
  - 标记 slot 为 idle
  - 清理 outputDir/inputDir

### 2. Server 侧：`reconcileStaleAgentClaims()`（`client-service.ts`）

在 `checkHeartbeats` 周期中增加反向校验：
- 遍历所有在线 client 的 agent 列表
- 如果某个 agent 的 `currentTaskId` 不在活跃任务集中（即任务已完成/取消/失败），主动将该 agent 状态修正为 idle 并清除 `currentTaskId`

### 设计考量

- Client 侧修复是**主要修复**：能停止实际的 agent 进程并释放资源
- Server 侧修复是**防御性兜底**：在 client 未及时自愈时纠正存储的状态
- Client 侧每个 heartbeat 增加 N 个 HTTP 请求（N = busy worker 数，通常 0-2）
- Server 侧增加一轮 O(agents) 遍历 + Set 查找，开销很小
