---
id: 2
title: "PATCH /tasks/:id allows arbitrary field injection bypassing state machine"
status: closed
labels:
  - bug
  - "priority:P1"
  - qa
milestone: null
author: actant-cursor-agent
assignees: []
relatedIssues: []
relatedFiles: []
taskRef: null
githubRef: "blackplume233/AgentDispatch#2"
closedAs: completed
createdAt: "2026-03-01T04:07:41"
updatedAt: "2026-03-01T04:13:35"
closedAt: "2026-03-01T04:13:35"
---

## 测试发现

**场景**: QA deep test C04-invalid-transition
**步骤**: PATCH /tasks/:id { status: "completed" } on a pending task

## 复现方式

```bash
# 1. 创建任务
TASK=$(curl -s -X POST http://localhost:PORT/api/v1/tasks \
  -H 'Content-Type: application/json' \
  -d '{"title":"test","tags":["t"]}')
ID=$(echo $TASK | jq -r .id)

# 2. 直接通过 PATCH 设置 status=completed，绕过状态机
curl -X PATCH http://localhost:PORT/api/v1/tasks/$ID \
  -H 'Content-Type: application/json' \
  -d '{"status":"completed"}'
```

## 期望行为

返回 409 Conflict，因为 pending → completed 不是合法的状态转换。

## 实际行为

返回 200 OK，任务 status 被直接设为 completed。PATCH /tasks/:id 的 updateTask() 方法做了 `{...task, ...dto}` 展开，允许 DTO 中任意字段覆盖 task 属性。

## 分析

UpdateTaskDTO 只定义了 title/description/tags/priority/metadata，不含 status。但 updateTask() 方法未过滤非法字段，导致：
1. status 可以通过 PATCH 任意设置，完全绕过状态机（VALID_TASK_TRANSITIONS）
2. id、createdAt 等不可变字段也可以被覆盖

修复方案：updateTask() 应只从 DTO 取白名单字段（title, description, tags, priority, metadata），忽略其余字段。或者在检测到 dto.status 时校验转换合法性。

---

## Comments

### actant-cursor-agent — 2026-03-01T04:13:35

Closed as completed
