# QA Alpha — 持久化 QA 调试环境

读取 `.agents/skills/qa-engineer/SKILL.md` 理解 QA 测试方法论（黑盒为主、白盒为辅、智能判断、Issue 追踪），然后按照下方流程在**持久化环境**中执行 QA。

与标准 `/qa` 的核心区别：环境不销毁、跨会话复用、仅在代码更新时重启。

---

## 指令格式

`/qa-alpha <mode> [args]`

| 模式 | 示例 | 行为 |
|------|------|------|
| **run** | `/qa-alpha run server-task-crud` | 在持久环境中执行场景 |
| **explore** | `/qa-alpha explore "并发创建 5 个任务"` | 在持久环境中即兴探索 |
| **status** | `/qa-alpha status` | 检查环境是否存活 |
| **restart** | `/qa-alpha restart` | 重建并重启环境（代码更新后） |
| **stop** | `/qa-alpha stop` | 手动停止环境（极少使用） |
| **create** | `/qa-alpha create "测试任务并发"` | 生成场景文件并在持久环境中执行 |
| **list** | `/qa-alpha list` | 列出所有场景 |

省略模式关键词时视为 **explore**。

---

## 持久化环境

### 目录结构

```
.qa/alpha/
├── env-state.json        # 环境状态（Server PID, port, build hash 等）
├── data/                 # DISPATCH_DATA_DIR（持久化，不删除）
│   ├── tasks/
│   ├── clients/
│   └── ...
├── logs/                 # QA 日志（按 round 编号）
│   ├── qa-log-round1.md
│   ├── qa-report-round1.md
│   └── ...
└── templates-loaded.json # 已加载数据的记录
```

### env-state.json 格式

```json
{
  "status": "running | stopped | unknown",
  "serverPid": 12345,
  "port": 23456,
  "dataPath": "<absolute path to .qa/alpha/data>",
  "buildHash": "<最近一次 build 的 git commit hash>",
  "buildTimestamp": "<ISO datetime>",
  "startedAt": "<ISO datetime>",
  "roundCounter": 3,
  "platform": "darwin | linux | win32"
}
```

---

## 执行流程

### Phase 0: 环境检查与恢复

**每次执行都必须先运行此步骤**。

#### Step 0.1: 读取环境状态

```bash
cat .qa/alpha/env-state.json
```

- 若文件不存在 → 进入「Phase 1: 首次初始化」
- 若文件存在 → 继续 Step 0.2

#### Step 0.2: 验证 Server 存活

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:<port>/api/v1/tasks
```

- 返回 200 → 环境存活，直接进入测试执行
- 失败 → 检查 Server PID 是否还活着：
  - PID 存活但不响应 → 杀死并重启
  - PID 不存活 → 标记为 stopped，重启 Server

#### Step 0.3: 检查代码是否需要重建

```bash
git rev-parse HEAD
```

对比 env-state.json 中的 `buildHash`：
- 相同 → 无需重建，环境就绪
- 不同 → 执行 `pnpm build`，更新 `buildHash` 和 `buildTimestamp`，然后 **restart Server**

---

### Phase 1: 首次初始化（仅首次）

#### Step 1.1: 创建目录

```bash
mkdir -p .qa/alpha/data
mkdir -p .qa/alpha/logs
```

#### Step 1.2: 构建项目

```bash
ls packages/server/dist/index.js 2>/dev/null || pnpm build
```

#### Step 1.3: 选取端口

```bash
PORT=$(( RANDOM % 10000 + 20000 ))
```

#### Step 1.4: 启动 Server（后台常驻）

```bash
DISPATCH_DATA_DIR="$(pwd)/.qa/alpha/data" DISPATCH_PORT=$PORT \
  node packages/server/dist/index.js &
SERVER_PID=$!
```

轮询 `curl http://localhost:$PORT/api/v1/tasks` 直到就绪。

#### Step 1.5: 写入 env-state.json

记录完整环境状态，设置 `roundCounter: 0`。

---

### Phase 2: 测试执行

环境就绪后，根据用户指令执行测试。

#### 命令执行格式

所有 HTTP 请求统一使用持久环境端口：

```bash
curl -s -X POST http://localhost:<port>/api/v1/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"test","type":"general","input":{"prompt":"hello"}}'
```

#### 日志与报告

- `roundCounter++`，更新 env-state.json
- 增量日志：`.qa/alpha/logs/qa-log-roundN.md`
- 轮次报告：`.qa/alpha/logs/qa-report-roundN.md`

日志规范完全遵循 qa-engineer SKILL.md 中的格式。

#### 测试步骤

遵循 qa-engineer SKILL.md 的全部测试策略：
- 黑盒为主（HTTP 请求/响应 + CLI I/O）
- 白盒为辅（检查 file-store 产物）
- 智能判断（PASS / WARN / FAIL）
- FAIL/WARN 自动创建/补充 Issue

#### 残留数据处理

持久环境中可能有上一轮残留的数据。每轮测试开始前：

1. 查看当前 tasks 和 clients（`GET /api/v1/tasks`、`GET /api/v1/clients`）
2. 如果场景需要干净环境：逐个删除残留数据
3. 如果场景需要在已有数据上继续：直接使用

**注意**：持久环境中不清理 data 目录。这正是 qa-alpha 的价值——可以测试跨会话的数据持久化。

---

### Phase 3: Restart（代码更新）

当用户执行 `/qa-alpha restart` 或 Phase 0.3 检测到代码更新时：

1. 停止 Server：`kill $SERVER_PID` + 杀死子进程树
2. 重建项目：`pnpm build`
3. 重启 Server（Step 1.4）
4. 更新 env-state.json（新 PID、新 buildHash）

**注意**：Restart 不删除 `data/` 目录。持久化数据保留。

---

### Phase 4: Stop（手动停止）

当用户执行 `/qa-alpha stop` 时：

1. 停止 Server + 杀死子进程树
2. 更新 env-state.json：`status → "stopped"`

**不删除任何文件**。下次 `/qa-alpha` 时会从 Phase 0 恢复。

---

## 与标准 QA 的对比

| 维度 | `/qa` (标准) | `/qa-alpha` (持久) |
|------|------------|------------------|
| 环境 | 每次 mktemp，用后即删 | `.qa/alpha/`，长期保留 |
| Server | 每次启停 | 常驻，跨会话复用 |
| 数据 | 每次干净 | 跨会话累积（可手动清理） |
| 适用场景 | 回归测试、CI 验证 | 开发调试、交互式探索、持久化测试 |
| 清理 | 每次必须完整清理 | 仅 stop 时清理进程，不删文件 |
| 代码更新 | 自动重建 | 检测 HEAD 变化自动重建+重启 |

---

## 注意事项

1. **不自动清理** — 这是 qa-alpha 的核心特性。环境在 `/qa-alpha stop` 后仍保留文件，只停止进程。
2. **代码更新自动重启** — 每次测试前检查 git HEAD，代码变了就 rebuild + restart Server。
3. **进程管理** — env-state.json 记录 Server PID，每次恢复时验证。PID 失效时自动重启。
4. **日志累积** — 日志文件按 round 编号递增累积，不覆盖。round 编号跨会话持续递增。
5. **Issue 追踪** — 同标准 QA：FAIL 创建 bug Issue，WARN 酌情创建 enhancement Issue。创建前先搜索避免重复。
6. **手动清理** — 若需完全重置环境，手动 `rm -rf .qa/alpha/` 即可。下次执行自动重建。
