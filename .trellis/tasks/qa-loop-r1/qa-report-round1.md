## QA 集成测试报告 — Round 1

**场景**: all (server-task-crud + server-client-lifecycle + server-error-handling + server-task-filtering)
**测试工程师**: QA SubAgent
**时间**: 2026-02-28T18:55 ~ 19:00
**结果**: FAILED (29/31 步骤通过, 0 警告, 2 失败)

### 摘要
| # | 步骤 | 命令 | 判定 |
|---|------|------|------|
| 1 | 创建任务 | `POST /tasks` | PASS |
| 2 | 查询任务 | `GET /tasks/:id` | PASS |
| 3 | 列出任务 | `GET /tasks` | PASS |
| 4 | 更新任务 | `PATCH /tasks/:id` | PASS |
| 5 | 认领任务 | `POST /tasks/:id/claim` | PASS |
| 6 | 报告进度 | `POST /tasks/:id/progress` | PASS |
| 7 | 取消任务 | `POST /tasks/:id/cancel` | PASS |
| 8 | 创建删除用任务 | `POST /tasks` | PASS |
| 9 | 删除任务 | `DELETE /tasks/:id` | PASS |
| 10 | 确认 404 | `GET /tasks/:id (deleted)` | PASS |
| 11 | 注册客户端 | `POST /clients/register` | PASS |
| 12 | 列出客户端 | `GET /clients` | PASS |
| 13 | 查询客户端 | `GET /clients/:id` | PASS |
| 14 | 心跳 | `POST /clients/:id/heartbeat` | PASS |
| 15 | 更新 Agents | `PATCH /clients/:id/agents` | PASS |
| 16 | 注销客户端 | `DELETE /clients/:id` | PASS |
| 17 | 确认 404 | `GET /clients/:id (unregistered)` | PASS |
| 18 | **空 body 创建** | `POST /tasks {}` | **FAIL** |
| 19 | 查询不存在任务 | `GET /tasks/fake-id` | PASS |
| 20 | 认领不存在任务 | `POST /tasks/fake-id/claim` | PASS |
| 21 | 取消 pending | `POST /tasks/:id/cancel` | PASS |
| 22 | 取消已取消 | `POST /tasks/:id/cancel` | PASS |
| 23 | 重复认领 | `POST /tasks/:id/claim` | PASS |
| 24 | 查询不存在客户端 | `GET /clients/fake-id` | PASS |
| 25 | 心跳不存在客户端 | `POST /clients/fake-id/heartbeat` | PASS |
| 26 | 批量创建 | `POST /tasks x5` | PASS |
| 27 | 列出全部 | `GET /tasks` | PASS |
| 28 | 状态过滤 | `GET /tasks?status=pending` | PASS |
| 29 | **标签过滤** | `GET /tasks?tag=gpu` | **FAIL** |
| 30 | 分页 p1 | `GET /tasks?page=1&limit=2` | PASS |
| 31 | 分页 p2 | `GET /tasks?page=2&limit=2` | PASS |

### 失败分析

**Step 18 — 空 body 创建任务 [FAIL]**:
- 期望: 返回 400，错误消息指明缺少 title/tags
- 实际: 返回 500 INTERNAL_ERROR
- 根因: `TaskService.createTask()` 无输入验证，`dto.tags` 为 undefined 时 `taskToMarkdown()` 的 `task.tags.map()` 崩溃。且 `store.save()` 中 JSON 先于 MD 写入，导致无效任务被持久化。

**Step 29 — 标签过滤崩溃 [FAIL]**（级联）:
- 期望: 返回包含 gpu 标签的任务列表
- 实际: 返回 500 INTERNAL_ERROR
- 根因: Step 18 的无效任务（tags=undefined）被持久化，`listTasks` 中 `t.tags.includes(tag)` 在 undefined 上崩溃。

### 单元测试
101/101 全通过。
