---
id: 16
title: "bug(client-node): 多 slot 共享 workDir 导致 opencode write 工具卡死"
status: open
labels:
  - bug
  - "priority:P0"
milestone: null
author: jiahao
assignees: []
relatedIssues: [17]
relatedFiles:
  - packages/client-node/src/agents/runtime-agent-config.ts
  - packages/client-node/src/node.ts
taskRef: null
githubRef: null
closedAs: null
createdAt: 2026-03-03T01:00:00
updatedAt: 2026-03-03T01:00:00
closedAt: null
---

## 背景

当 `client.config.json` 中配置 `maxConcurrency: 2` 时，`expandWorkerConfig` 将一个 worker 展开为 `code-km-p4:0` 和 `code-km-p4:1` 两个 slot。但两个 slot **共享同一个 `workDir`**，导致两个 opencode 进程在同一工作目录并发运行。

## 复现

1. 配置 `code-km-p4` worker，`maxConcurrency: 2`
2. 同时提交两个匹配的任务（如 `km` 和 `tapd` 标签）
3. 两个 slot 各自 claim 一个任务，各启动一个 opencode 进程
4. 两个 opencode 进程在同一 workDir 中执行，到达 `write` 工具调用时卡死

## 现象

- opencode 的 `write` 工具状态停留在 `in_progress`，永远不报告 `completed`
- **文件实际已写入磁盘**（时间戳与 `in_progress` 事件精确吻合），但 opencode 进程无法完成后续状态流转
- 100% 的 write 调用都异常：4 次 write 中 2 次卡死、2 次立即失败后重试再卡死
- 其他工具（bash、MCP 调用、todowrite、read）全部正常

## 根因分析

两个 opencode 实例共享同一工作目录，opencode 内部的 write 工具在处理文件写入时维护内部状态（文件变更追踪、会话状态等）。当两个进程同时在同一工作目录中执行 write 操作时发生冲突：
- 一个实例的 write 可能立即失败（检测到冲突）
- 另一个实例的 write 完成了磁盘写入，但在更新内部状态时死锁

## 修复方案

### 1. `runtime-agent-config.ts` — slot 独立 workDir

`expandWorkerConfig` 为多 slot 生成隔离目录：

```
baseWorkDir: worker.workDir          // 原始目录（配置/技能源）
workDir: `${worker.workDir}/slot-${slotIndex}`  // 独立运行目录
```

单 slot（`maxConcurrency <= 1`）保持原行为，`baseWorkDir === workDir`。

### 2. `node.ts` — 自动准备 slot workDir

在 agent 启动前调用 `prepareSlotWorkDir(cfg)`：
- 创建 slot 目录
- 从 baseWorkDir 镜像 junction links（`.claude/`、`.cursor/`、`.kl/` → 同一目标）
- 复制配置文件（`opencode.json`、`AGENTS.md` 等）
- 跳过运行时目录（`.dispatch/`、`.local/`、`.artifacts/`）

每个 slot 得到完整的配置环境，技能/规则/MCP 全部可用，且进程状态完全隔离。

## 注意事项

- Windows junction 创建不需要管理员权限（与 symlink 不同）
- 配置文件是副本，base 更新后需要 config reload 或重启才能同步
- junction 指向的目录（技能、规则）是透明的，修改源目录立即生效
