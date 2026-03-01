---
id: 1
title: POST /clients/register returns 500 instead of 400 on missing fields
status: open
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
githubRef: "blackplume233/AgentDispatch#1"
closedAs: null
createdAt: "2026-03-01T04:07:40"
updatedAt: "2026-03-01T04:07:51"
closedAt: null
---

## 测试发现

**场景**: QA deep test B03-register-client
**步骤**: POST /clients/register with missing required fields (host, agents)

## 复现方式

```bash
curl -X POST http://localhost:PORT/api/v1/clients/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"test","capabilities":{},"dispatchMode":"worker-only"}'
```

## 期望行为

返回 400 Bad Request，带有明确的校验错误信息（如 'host is required', 'agents is required'）

## 实际行为

返回 500 Internal Server Error。agents 为 undefined 时 dto.agents.map() 触发 TypeError。

## 分析

client-service.ts register() 方法缺少对 DTO 必填字段的前置校验。应在使用 dto.agents 之前检查 host 和 agents 是否存在且类型正确。
