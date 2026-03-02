---
description: "Migrated command: /trellis/qa-fix"
---

# QA Fix — 交互式 Bug 修复环境

复用 qa-alpha 的持久化环境（`.qa/alpha/`），在同一个 Server 上进行**交互式 Bug 查找 → 修复 → 自动重装 → 验证**循环。

与 `/trellis/qa-alpha` 的核心区别：不执行测试场景，而是**接受用户描述的问题，主动搜索根因，修改源码，自动 rebuild+restart，再验证修复效果**。

---

## 指令格式

`/trellis/qa-fix [mode] [args]`

| 模式 | 示例 | 行为 |
|------|------|------|
| **fix** | `/trellis/qa-fix "创建任务返回 500"` | 查找根因 → 修复 → 重装 → 验证 |
| **search** | `/trellis/qa-fix search "心跳超时不生效"` | 仅搜索根因，不修改代码 |
| **optimize** | `/trellis/qa-fix optimize "任务列表响应慢"` | 性能/体验优化，自动重装验证 |
| **status** | `/trellis/qa-fix status` | 查看共享环境状态 |
| **restart** | `/trellis/qa-fix restart` | 重建并重启共享环境 |

省略模式关键词时视为 **fix**。

---

## 共享环境

与 `/trellis/qa-alpha` 共用同一持久化目录：

```
.qa/alpha/          ← 共享，不重复创建
├── env-state.json
├── data/
└── logs/
    ├── qa-fix-roundN.md    ← fix 专属日志（区别于 qa-log-roundN）
    └── ...
```

**不创建新目录**，直接复用 qa-alpha 的环境状态和 Server。

### Dashboard（必选）

QA Fix 环境**必须同时启动 Dashboard 前端**，确保每次修复都覆盖前后端验证。

- **Dashboard Dev Server**: `pnpm --filter @agentdispatch/dashboard dev`（端口 3000，proxy → Server 9800）
- Dashboard 进程 PID 记录在 `env-state.json` 的 `dashboardPid` 字段
- Phase 0 环境检查时，除了检查 Server 存活，还必须检查 Dashboard 存活（`curl http://localhost:3000`）
- Dashboard 未运行时自动启动；修复后 rebuild 如涉及 dashboard 包，自动重启 Dashboard

### Worker / ClientNode（必选）

QA Fix 环境**必须有一个运行中的 ClientNode 进程**，负责自动认领 pending 任务。

- **启动脚本**: `node .qa/fix/start-worker.mjs`
- **配置文件**: `.qa/fix/client.config.json`（name=`qa-worker-node`，polling 3s，heartbeat 10s，9 条 dispatch rules）
- **Agent Stub**: `.qa/fix/worker-stub.mjs`（占位 Agent，5s 后正常退出）
- Worker PID 记录在 `env-state.json` 的 `workerPid` 字段
- Worker 崩溃/退出时任务会自动释放回 pending（已实现的心跳超时机制）
- Phase 0 环境检查时，必须检查 Worker 存活；未运行时自动启动

---

## 执行流程

### Phase 0: 环境检查（与 qa-alpha 完全一致）

**每次执行必须先完成此步骤。**

#### Step 0.1: 读取环境状态

```bash
cat .qa/alpha/env-state.json
```

- 若不存在 → 执行与 qa-alpha Phase 1 完全相同的「首次初始化」流程
- 若存在 → 继续 Step 0.2

#### Step 0.2: 验证 Server 存活

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:<port>/api/v1/tasks
```

- 返回 200 → 继续 Step 0.2b
- 否则 → 重启 Server（参照 qa-alpha Phase 3 restart 流程）

#### Step 0.2b: 验证 Dashboard 存活

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

- 返回 200 → 继续 Step 0.3
- 否则 → 启动 Dashboard：`pnpm --filter @agentdispatch/dashboard dev`（后台运行），记录 PID 到 `env-state.json` 的 `dashboardPid` 字段，轮询 `http://localhost:3000` 直到返回 200（最多 30s）

#### Step 0.2c: 验证 Worker (ClientNode) 存活

QA Fix 环境**必须有一个正在运行的 ClientNode 进程**，负责轮询 Server 中的 pending 任务并自动认领。

1. 检查 `env-state.json` 中的 `workerPid` 是否存在且对应进程存活
2. 若不存活 → 启动 Worker：

```bash
node .qa/fix/start-worker.mjs &
```

3. 等待 Worker 注册成功（日志中出现 `Registered as`），记录 PID 到 `env-state.json` 的 `workerPid` 字段
4. 验证 Worker 已注册：`curl -s http://localhost:9800/api/v1/clients` 中应包含 `qa-worker-node`

- Worker 配置文件：`.qa/fix/client.config.json`
- Worker 启动脚本：`.qa/fix/start-worker.mjs`
- Worker Stub（占位 Agent）：`.qa/fix/worker-stub.mjs`

#### Step 0.3: 检查代码是否需要重建

```bash
git rev-parse HEAD
```

与 `buildHash` 对比：不同则 `pnpm build` + restart Server + 更新 env-state.json。

---

### Phase 1: 问题搜索（Search）

接收用户描述的问题，系统性定位根因。

#### Step 1.1: 复现问题

在持久环境中执行用户描述的操作，捕获完整输出：

```bash
curl -s -w "\n%{http_code}" -X POST http://localhost:<port>/api/v1/<endpoint> ...
```

记录：原始请求、完整 response body、HTTP status code。

#### Step 1.2: 根因分析

根据错误信息，**按以下优先级**搜索代码：

1. **精确搜索**：在源码中搜索错误消息字符串（使用 Grep 工具）
2. **调用链追踪**：从错误发生位置向上追踪调用栈
3. **类型检查**：检查 DTO 定义和 Zod schema 验证逻辑
4. **日志辅助**：检查 `.qa/alpha/logs/` 中历史日志的相关条目

输出根因定位报告：
```
根因定位
文件：<filepath>:<line>
函数：<function name>
原因：<one-line description>
影响范围：<其他可能受影响的模块>
```

---

### Phase 2: 修复实施（Fix）

#### Step 2.1: 确认修复方案

在修改前，简述修复思路（1-3 句话），让用户知晓即将修改的内容。

#### Step 2.2: 修改源码

直接编辑源文件修复 Bug：
- 最小化改动原则：只改必要的代码
- 保持原有代码风格
- 不添加多余注释

#### Step 2.3: 检查 Lint

```bash
pnpm lint --filter <changed-package>
```

有 lint 错误立即修复，不跳过。

---

### Phase 3: 自动重装（Auto Rebuild & Restart）

修复完成后**自动执行**，无需用户手动触发。

#### Step 3.1: 重建项目

```bash
pnpm build
```

构建失败时：
- 输出具体错误
- 修复编译错误后重试
- 若无法修复，还原修改并报告

#### Step 3.2: 重启 Server

1. 停止 Server：`kill $SERVER_PID` + `pkill -P $SERVER_PID`
2. 重启 Server（qa-alpha Phase 1.4 流程）
3. 更新 env-state.json：新 PID、新 buildHash、新 buildTimestamp

#### Step 3.2b: 重启 Dashboard（如需要）

如果变更涉及 `packages/dashboard/` 或 `packages/shared/`（共享类型），Vite HMR 通常自动生效。若 Dashboard 进程已不存在，重新启动：

```bash
pnpm --filter @agentdispatch/dashboard dev
```

更新 `env-state.json` 的 `dashboardPid`。

#### Step 3.2c: 重启 Worker / ClientNode

Server 重启后，旧的 ClientNode 连接会断开。必须重启 Worker：

1. 停止旧 Worker 进程：`kill $WORKER_PID`
2. 删除旧的 Client 注册（可选，Server 重启后已清空）
3. 启动新 Worker：`node .qa/fix/start-worker.mjs &`
4. 等待日志中出现 `Registered as` 和 `Ready — waiting for tasks...`
5. 更新 `env-state.json` 的 `workerPid`

#### Step 3.3: 等待就绪

轮询 `curl http://localhost:$PORT/api/v1/tasks` 直到返回 200，最多等待 30s。
同时确认 Dashboard 可访问（`curl http://localhost:3000` 返回 200）。
确认 Worker 已注册（`curl http://localhost:9800/api/v1/clients` 包含 `qa-worker-node`）。

---

### Phase 4: 修复验证（Verify）

#### Step 4.1: 重现原始操作

用相同的请求重新执行，验证问题已消失。

#### Step 4.1b: Dashboard 前端验证

对涉及前端展示的修复，**必须通过浏览器验证 Dashboard**：

1. 使用 browser-use subagent 访问 `http://localhost:3000`
2. 导航到与修复相关的页面（任务列表、任务详情、客户端列表等）
3. 截图确认 UI 渲染正确、数据显示准确
4. 若修复涉及 API 响应结构变更，重点检查 Dashboard 是否正确消费新字段

即使修复仅涉及后端代码，也应快速检查 Dashboard 无报错（控制台无 JS 错误、页面可正常加载）。

#### Step 4.2: 回归检查

```bash
pnpm test:changed
```

确保修改没有破坏其他功能。

#### Step 4.3: 输出修复报告

写入 `.qa/alpha/logs/trellis/qa-fix-roundN.md`（N 与 env-state.json 的 roundCounter 对齐）：

```markdown
## Fix Round N — <简短标题>

**问题描述**：<用户输入>
**复现请求**：`<curl command>`
**根因**：`<file>:<line>` — <description>
**修改文件**：
- `<filepath>` — <change summary>

**验证结果**：PASS / FAIL
**Dashboard 验证**：PASS / FAIL / N/A（截图或描述）
**回归测试**：PASS / FAIL（N 个测试）
**耗时**：<elapsed>
```

- FAIL 时：自动调用 issue-manager skill 创建 bug Issue（先搜索避免重复）

---

### Phase 5: 优化模式（Optimize）

当用户使用 `/trellis/qa-fix optimize <description>` 时：

1. **性能剖析**：在持久环境中执行操作，捕获耗时数据
2. **瓶颈定位**：搜索相关代码路径，识别性能热点
3. **实施优化**：修改源码（缓存、并发、减少 I/O 等）
4. **自动重装**：同 Phase 3
5. **对比验证**：执行相同操作，对比优化前后耗时
6. 输出优化报告，写入 `qa-fix-roundN.md`

---

## 修复循环

每次修复完成后，**主动询问用户**是否有下一个问题：

```
✓ Fix Round N 完成
  - 修复：<one-line summary>
  - 验证：PASS
  - 环境保持运行中

下一个问题？（直接描述，或输入 /trellis/qa-fix stop 退出）
```

环境持续运行，直到用户明确停止。

---

## 与 qa-alpha 的关系

| 维度 | `/trellis/qa-alpha` | `/trellis/qa-fix` |
|------|------------|-----------|
| 共享环境 | ✓ 相同目录和 Server | ✓ 完全复用 |
| Dashboard | 可选 | **必选**（始终启动） |
| 触发方式 | 执行预设/临时测试场景 | 接收用户描述的 Bug |
| 代码修改 | ✗ 不修改源码 | ✓ 直接修改源码修复 |
| 重装时机 | 手动 restart 或检测到 HEAD 变化 | 每次修复后**自动** rebuild+restart |
| 适用场景 | 黑盒测试、场景验证 | 交互式调试、Bug 修复、性能优化 |
| 日志前缀 | `qa-log-roundN` | `qa-fix-roundN` |

**两者可并行使用**：修复后可立即用 `/trellis/qa-alpha` 回归验证修复效果。

---

## 注意事项

1. **共享 Server** — 与 qa-alpha 共用同一个 Server 实例，修改代码 rebuild 后 Server 会重启，正在运行的 qa-alpha 测试会中断。
2. **Dashboard 必选** — QA Fix 环境**必须包含 Dashboard**。环境初始化和每次修复验证都要确保 Dashboard 可用。即使修复仅涉及后端，也要快速检查 Dashboard 无异常。
3. **Worker 必选** — QA Fix 环境**必须有运行中的 ClientNode**。自动认领由 ClientNode 负责（客户端架构），不是 Server 端功能。Server 重启后必须同步重启 Worker。
4. **最小化修改** — 每次只修复一个问题，避免大范围重构。
5. **自动重装** — 修复后无需手动 restart，Phase 3 自动处理（含 Worker 重启）。
6. **修复失败回退** — 若 build 失败，使用 `git checkout -- <files>` 还原，报告无法修复。
7. **Issue 追踪** — 验证失败时自动创建 Issue，确保问题有记录。
7. **Dashboard 端口** — Dashboard Dev Server 固定 3000 端口，通过 Vite proxy 转发 `/api` 到 Server 9800。若端口冲突，检查并终止占用进程。
