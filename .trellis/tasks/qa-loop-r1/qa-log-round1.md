# QA Log — Round 1

**开始时间**: 2026-02-28T18:55:00+08:00
**Server**: http://localhost:25160
**TEST_DIR**: /var/folders/fn/b_65rxxj6c76pt593mkw1drc0000gn/T/dispatch-qa-XXXXXX.Ek7bvr5WzS

---

## 单元测试

### [Unit Tests] pnpm test
**时间**: 2026-02-28T18:58:17+08:00

#### 输入
```
pnpm test
```

#### 输出
```
exit_code: 0

packages/shared:   7 passed (7)
packages/dashboard: 2 passed (2)
packages/client-cli: 2 passed (2)
packages/client-node: 28 passed (28)
packages/server: 62 passed (62)

Total: 101 tests, 101 passed, 0 failed
```

#### 判断: PASS
全部 101 个单元测试通过，无失败、无警告。

---

## 场景 1: server-task-crud

### [Step 1] 创建任务
**时间**: 2026-02-28T18:58:36+08:00

#### 输入
```
POST http://localhost:25160/api/v1/tasks
{"title":"QA Test Task","tags":["qa","test"],"priority":"normal","description":"Task for QA testing"}
```

#### 输出
```
http_status: 201

--- response_body ---
{"id":"2125e744-b7c5-4580-a70b-42699eacda9a","title":"QA Test Task","description":"Task for QA testing","status":"pending","tags":["qa","test"],"priority":"normal","createdAt":"2026-02-28T10:58:36.683Z","updatedAt":"2026-02-28T10:58:36.683Z"}
```

#### 判断: PASS
返回 201，包含 id、status=pending、title 与请求一致。

### [Step 2] 查询任务
**时间**: 2026-02-28T18:58:44+08:00

#### 输入
```
GET http://localhost:25160/api/v1/tasks/2125e744-b7c5-4580-a70b-42699eacda9a
```

#### 输出
```
http_status: 200

--- response_body ---
{"id":"2125e744-b7c5-4580-a70b-42699eacda9a","title":"QA Test Task","description":"Task for QA testing","status":"pending","tags":["qa","test"],"priority":"normal","createdAt":"2026-02-28T10:58:36.683Z","updatedAt":"2026-02-28T10:58:36.683Z"}
```

#### 判断: PASS
返回 200，字段与创建时完全一致。

### [Step 3] 列出所有任务
**时间**: 2026-02-28T18:58:44+08:00

#### 输入
```
GET http://localhost:25160/api/v1/tasks
```

#### 输出
```
http_status: 200

--- response_body ---
[{"id":"2125e744-b7c5-4580-a70b-42699eacda9a","title":"QA Test Task","description":"Task for QA testing","status":"pending","tags":["qa","test"],"priority":"normal","createdAt":"2026-02-28T10:58:36.683Z","updatedAt":"2026-02-28T10:58:36.683Z"}]
```

#### 判断: PASS
返回 200，列表包含 1 条刚创建的任务。

### [Step 4] 更新任务
**时间**: 2026-02-28T18:58:44+08:00

#### 输入
```
PATCH http://localhost:25160/api/v1/tasks/2125e744-b7c5-4580-a70b-42699eacda9a
{"title":"Updated QA Task","priority":"high"}
```

#### 输出
```
http_status: 200

--- response_body ---
{"id":"2125e744-b7c5-4580-a70b-42699eacda9a","title":"Updated QA Task","description":"Task for QA testing","status":"pending","tags":["qa","test"],"priority":"high","createdAt":"2026-02-28T10:58:36.683Z","updatedAt":"2026-02-28T10:58:44.205Z"}
```

#### 判断: PASS
title 和 priority 已更新，updatedAt 已刷新。

### [Step 5] 认领任务
**时间**: 2026-02-28T18:58:44+08:00

#### 输入
```
POST http://localhost:25160/api/v1/tasks/2125e744-b7c5-4580-a70b-42699eacda9a/claim
{"clientId":"test-client-1","agentId":"agent-1"}
```

#### 输出
```
http_status: 200

--- response_body ---
{"id":"2125e744-...","status":"claimed","claimedBy":{"clientId":"test-client-1","agentId":"agent-1"},"claimedAt":"2026-02-28T10:58:44.227Z",...}
```

#### 判断: PASS
status 变为 claimed，claimedBy 正确记录。

### [Step 6] 报告进度
**时间**: 2026-02-28T18:58:44+08:00

#### 输入
```
POST http://localhost:25160/api/v1/tasks/2125e744-b7c5-4580-a70b-42699eacda9a/progress
{"clientId":"test-client-1","agentId":"agent-1","progress":50,"message":"halfway done"}
```

#### 输出
```
http_status: 200

--- response_body ---
{"id":"2125e744-...","status":"in_progress","progress":50,"progressMessage":"halfway done",...}
```

#### 判断: PASS
status 从 claimed 自动转为 in_progress，progress=50。

### [Step 7] 取消任务（from in_progress）
**时间**: 2026-02-28T18:58:44+08:00

#### 输入
```
POST http://localhost:25160/api/v1/tasks/2125e744-b7c5-4580-a70b-42699eacda9a/cancel
{"reason":"QA test cancellation"}
```

#### 输出
```
http_status: 200

--- response_body ---
{"id":"2125e744-...","status":"cancelled",...}
```

#### 判断: PASS
in_progress → cancelled 合法转换成功。

### [Step 8] 创建用于删除的任务
**时间**: 2026-02-28T18:58:50+08:00

#### 输入
```
POST http://localhost:25160/api/v1/tasks
{"title":"Task to Delete 2","tags":["delete-test2"]}
```

#### 输出
```
http_status: 201
Created ef4155a0-8a80-443d-a9b1-6124ac2388c0
```

#### 判断: PASS

### [Step 9] 删除任务
**时间**: 2026-02-28T18:58:50+08:00

#### 输入
```
DELETE http://localhost:25160/api/v1/tasks/ef4155a0-8a80-443d-a9b1-6124ac2388c0
```

#### 输出
```
http_status: 204
(empty body)
```

#### 判断: PASS
返回 204 No Content，符合 RESTful 删除规范。

### [Step 10] 确认已删除任务返回 404
**时间**: 2026-02-28T18:58:50+08:00

#### 输入
```
GET http://localhost:25160/api/v1/tasks/ef4155a0-8a80-443d-a9b1-6124ac2388c0
```

#### 输出
```
http_status: 404

--- response_body ---
{"error":{"code":"TASK_NOT_FOUND","message":"Task ef4155a0-8a80-443d-a9b1-6124ac2388c0 not found"},"timestamp":"2026-02-28T10:58:50.745Z"}
```

#### 判断: PASS
已删除的任务正确返回 404。

---

## 场景 2: server-client-lifecycle

### [Step 11] 注册客户端
**时间**: 2026-02-28T18:58:57+08:00

#### 输入
```
POST http://localhost:25160/api/v1/clients/register
{"name":"qa-test-node","host":"localhost:9999","dispatchMode":"tag-auto","agents":[{"id":"agent-1","type":"worker","status":"idle","tags":["gpu"]}],"tags":["gpu","linux"]}
```

#### 输出
```
http_status: 201

--- response_body ---
{"id":"2aab5ac3-2b2b-4d0f-ba41-227483208bc4","name":"qa-test-node","host":"localhost:9999","status":"online","tags":["gpu","linux"],"dispatchMode":"tag-auto","agents":[{"id":"agent-1","type":"worker","status":"idle","capabilities":[]}],"lastHeartbeat":"2026-02-28T10:58:57.690Z","registeredAt":"2026-02-28T10:58:57.690Z"}
```

#### 判断: PASS
返回 201，status=online，字段正确。注意 agents[].tags 被映射为 capabilities=[]（WARN 级别，见后续分析）。

### [Step 12] 列出客户端
**时间**: 2026-02-28T18:58:57+08:00

#### 输入
```
GET http://localhost:25160/api/v1/clients
```

#### 输出
```
http_status: 200
列表包含 1 个客户端，与注册时一致。
```

#### 判断: PASS

### [Step 13] 查询客户端
**时间**: 2026-02-28T18:59:04+08:00

#### 输入
```
GET http://localhost:25160/api/v1/clients/2aab5ac3-2b2b-4d0f-ba41-227483208bc4
```

#### 输出
```
http_status: 200
字段与注册时一致。
```

#### 判断: PASS

### [Step 14] 心跳
**时间**: 2026-02-28T18:59:04+08:00

#### 输入
```
POST http://localhost:25160/api/v1/clients/2aab5ac3-2b2b-4d0f-ba41-227483208bc4/heartbeat
{}
```

#### 输出
```
http_status: 204
(empty body)
```

#### 判断: PASS
心跳返回 204，符合预期。

### [Step 15] 更新 Agent 列表
**时间**: 2026-02-28T18:59:04+08:00

#### 输入
```
PATCH http://localhost:25160/api/v1/clients/2aab5ac3-2b2b-4d0f-ba41-227483208bc4/agents
[{"id":"agent-1","type":"worker","status":"busy","capabilities":[]},{"id":"agent-2","type":"manager","status":"idle","capabilities":[]}]
```

#### 输出
```
http_status: 200
agents 列表已更新为 2 个 agent，lastHeartbeat 已更新。
```

#### 判断: PASS

### [Step 16] 注销客户端
**时间**: 2026-02-28T18:59:04+08:00

#### 输入
```
DELETE http://localhost:25160/api/v1/clients/2aab5ac3-2b2b-4d0f-ba41-227483208bc4
```

#### 输出
```
http_status: 204
```

#### 判断: PASS

### [Step 17] 确认注销后返回 404
**时间**: 2026-02-28T18:59:04+08:00

#### 输入
```
GET http://localhost:25160/api/v1/clients/2aab5ac3-2b2b-4d0f-ba41-227483208bc4
```

#### 输出
```
http_status: 404
{"error":{"code":"CLIENT_NOT_FOUND","message":"Client 2aab5ac3-2b2b-4d0f-ba41-227483208bc4 not found"}}
```

#### 判断: PASS

---

## 场景 3: server-error-handling

### [Step 18] 创建缺少必填字段的任务（空 body）
**时间**: 2026-02-28T18:59:09+08:00

#### 输入
```
POST http://localhost:25160/api/v1/tasks
{}
```

#### 输出
```
http_status: 500

--- response_body ---
{"error":{"code":"INTERNAL_ERROR","message":"Internal server error"},"timestamp":"2026-02-28T10:59:09.925Z"}
```

#### 判断: FAIL
**期望**: 返回 400，错误消息指明缺少 title 和 tags 字段。
**实际**: 返回 500 Internal Server Error。
**分析**: CreateTask 路由无输入验证。`dto.tags` 为 undefined 时，`task.tags` 为 undefined。`store.save()` 中 `writeJson` 先成功写入 JSON（tags 字段缺失），然后 `taskToMarkdown()` 调用 `task.tags.map()` 时崩溃。**级联效应**：这个无效任务的 JSON 文件已持久化到磁盘，后续所有涉及 `listTasks` 且触发 `tags.includes()` 的操作都会崩溃（见 Step 29）。

### [Step 19] 查询不存在的任务
**时间**: 2026-02-28T18:59:09+08:00

#### 输入
```
GET http://localhost:25160/api/v1/tasks/nonexistent-id-12345
```

#### 输出
```
http_status: 404
{"error":{"code":"TASK_NOT_FOUND","message":"Task nonexistent-id-12345 not found"}}
```

#### 判断: PASS

### [Step 20] 认领不存在的任务
**时间**: 2026-02-28T18:59:09+08:00

#### 输入
```
POST http://localhost:25160/api/v1/tasks/nonexistent-id-12345/claim
{"clientId":"c1","agentId":"a1"}
```

#### 输出
```
http_status: 404
{"error":{"code":"TASK_NOT_FOUND","message":"Task nonexistent-id-12345 not found"}}
```

#### 判断: PASS

### [Step 21] 取消 pending 任务
**时间**: 2026-02-28T18:59:22+08:00

#### 输入
```
POST http://localhost:25160/api/v1/tasks/644f9899-.../cancel
{}
```

#### 输出
```
http_status: 200
status 变为 cancelled。
```

#### 判断: PASS
pending → cancelled 是合法转换。

### [Step 22] 对已取消的任务再次取消（非法转换）
**时间**: 2026-02-28T18:59:22+08:00

#### 输入
```
POST http://localhost:25160/api/v1/tasks/644f9899-.../cancel
{}
```

#### 输出
```
http_status: 400
{"error":{"code":"TASK_INVALID_TRANSITION","message":"Cannot cancel task in cancelled status"}}
```

#### 判断: PASS
非法转换正确返回 400 和描述性错误消息。

### [Step 23] 重复认领（double claim）
**时间**: 2026-02-28T18:59:22+08:00

#### 输入
```
POST http://localhost:25160/api/v1/tasks/87793617-.../claim (已被 c1/a1 认领)
{"clientId":"c2","agentId":"a2"}
```

#### 输出
```
http_status: 409
{"error":{"code":"TASK_ALREADY_CLAIMED","message":"Task 87793617-... is already claimed"}}
```

#### 判断: PASS
重复认领正确返回 409 Conflict。

### [Step 24] 查询不存在的客户端
**时间**: 2026-02-28T18:59:22+08:00

#### 输入
```
GET http://localhost:25160/api/v1/clients/nonexistent-client-id
```

#### 输出
```
http_status: 404
{"error":{"code":"CLIENT_NOT_FOUND","message":"Client nonexistent-client-id not found"}}
```

#### 判断: PASS

### [Step 25] 对不存在的客户端发送心跳
**时间**: 2026-02-28T18:59:22+08:00

#### 输入
```
POST http://localhost:25160/api/v1/clients/nonexistent-client-id/heartbeat
{}
```

#### 输出
```
http_status: 404
{"error":{"code":"CLIENT_NOT_FOUND","message":"Client nonexistent-client-id not found"}}
```

#### 判断: PASS

---

## 场景 4: server-task-filtering

### [Step 26] 批量创建 5 个任务
**时间**: 2026-02-28T18:59:32+08:00

#### 输入
```
POST /api/v1/tasks x5
tags: ["gpu","batch"], ["tag-2","batch"], ["gpu","batch"], ["tag-4","batch"], ["tag-5","batch"]
```

#### 输出
```
5 个任务全部创建成功（201）。
```

#### 判断: PASS

### [Step 27] 列出所有任务
**时间**: 2026-02-28T18:59:32+08:00

#### 输入
```
GET http://localhost:25160/api/v1/tasks
```

#### 输出
```
http_status: 200
Total tasks: 10
```

#### 判断: PASS
包含了之前场景遗留的 + 本批次新建的任务。

### [Step 28] 按 status=pending 过滤
**时间**: 2026-02-28T18:59:32+08:00

#### 输入
```
GET http://localhost:25160/api/v1/tasks?status=pending
```

#### 输出
```
http_status: 200
Filtered tasks: 7, all pending: True
```

#### 判断: PASS
status 过滤正常，只返回 pending 状态的任务。

### [Step 29] 按 tag=gpu 过滤
**时间**: 2026-02-28T18:59:43+08:00

#### 输入
```
GET http://localhost:25160/api/v1/tasks?tag=gpu
```

#### 输出
```
http_status: 500

--- response_body ---
{"error":{"code":"INTERNAL_ERROR","message":"Internal server error"},"timestamp":"2026-02-28T10:59:43.540Z"}
```

#### 判断: FAIL
**期望**: 返回包含 gpu 标签的任务列表。
**实际**: 返回 500 Internal Server Error。
**分析**: 这是 Step 18 Bug 的级联效应。Step 18 创建的无效任务（`tags: undefined`）被持久化到磁盘。`listTasks` 读取所有任务后，`filter(t => t.tags.includes(tag))` 在该无效任务上调用 `undefined.includes("gpu")` 导致 TypeError 崩溃。根因是两个问题叠加：(1) CreateTask 缺少输入验证；(2) `store.save()` 中 JSON 写入先于 Markdown 生成，部分写入导致数据污染。

### [Step 30] 分页 page=1 limit=2
**时间**: 2026-02-28T18:59:43+08:00

#### 输入
```
GET http://localhost:25160/api/v1/tasks?page=1&limit=2
```

#### 输出
```
http_status: 200
Page 1 count: 2
```

#### 判断: PASS
分页正常，返回 2 条记录。

### [Step 31] 分页 page=2 limit=2
**时间**: 2026-02-28T18:59:43+08:00

#### 输入
```
GET http://localhost:25160/api/v1/tasks?page=2&limit=2
```

#### 输出
```
http_status: 200
Page 2 count: 2
```

#### 判断: PASS
第二页正常返回 2 条记录。
