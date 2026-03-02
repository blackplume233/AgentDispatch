---
id: 14
title: "feat(dashboard): 优化展示 — ToolCall 合并、非文本步骤自动折叠、看板进度改用 progressMessage 摘要"
status: open
labels:
  - enhancement
  - "priority:P2"
milestone: null
author: human
assignees: []
relatedIssues: []
relatedFiles:
  - packages/dashboard/src/pages/TaskDetailPage.tsx
  - packages/dashboard/src/pages/TasksPage.tsx
taskRef: null
githubRef: "blackplume233/AgentDispatch#14"
closedAs: null
createdAt: 2026-03-02T17:50:55
updatedAt: 2026-03-02T17:50:55
closedAt: null
---

## 背景

当前 Dashboard 的交互时间线和任务总览看板存在以下体验问题，需要优化。

## 需求

### 1. 连续相同 ToolCall 合并显示

当前 `mergeLogs` 已将连续的 `tool_call`/`tool_call_update` 条目合并为一条，但合并后内容全部展开，占据大量空间。

**期望**：连续相同工具名（`metadata.toolName` 一致）的 ToolCall 合并为一个可折叠组，显示 `工具名 ×N` 的摘要头，展开后显示各次调用详情。不同工具名的连续 ToolCall 不应合并。

**涉及**：`TaskDetailPage.tsx` 中的 `isMergeable`、`mergeLogs`、`InteractionEntry` 组件。

### 2. 非文本汇报步骤默认自动折叠

当前 `InteractionEntry` 仅对 `thinking` 和长 `text` 默认折叠。

**期望**：只有 `text` 类型（Agent 的文本汇报）默认展开，其他所有类型（`tool_call`、`tool_call_update`、`fs_read`、`fs_write`、`terminal`、`thinking`、`plan`、`permission`、`system`、`error`）默认折叠，用户可手动点击展开。

**涉及**：`InteractionEntry` 组件中的 `expanded` 初始值逻辑。

### 3. 任务总览看板：进度条替换为 progressMessage 摘要

当前看板（Kanban）卡片和表格视图使用 `<Progress value={task.progress}>` 百分比进度条。

**期望**：取消数值进度条，改为显示 `task.progressMessage` 文本摘要（与 `TaskDetailPage` 中已有的 progressMessage 展示一致），配合活跃状态时的绿色 pulse 圆点。无 progressMessage 时不显示任何进度信息。

**涉及**：
- `TasksPage.tsx` 中的 `KanbanColumn` 组件（`task.progress` → `task.progressMessage`）
- `TasksPage.tsx` 中的 `TaskTable` 组件（Progress 列改为显示 progressMessage 文本）

## 验收标准

- [ ] 连续同名 ToolCall 合并为可折叠组，标题显示工具名和调用次数
- [ ] 只有 text 类型默认展开，其他步骤类型均默认折叠
- [ ] Kanban 卡片和 Table 视图不再显示百分比进度条，改为 progressMessage 文本
- [ ] 已有单元测试不被破坏
