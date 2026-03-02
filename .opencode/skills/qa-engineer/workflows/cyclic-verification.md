# QA 循环验证流程

## 概述

循环验证是 QA 工程师在发现缺陷后持续修复-回归的标准化流程。核心原则：**修复后必须重新执行完整测试，直到 100% 通过为止**。

## 流程图

```
测试 → 报告 → Issue → 修复 → 回归测试 ─→ 全部PASS → 内化场景
                                  │
                                  └─ 仍有FAIL → 修复 → 回归测试（循环）
```

## 标准流程

### Phase 1: 完整测试

1. **环境准备**
   - `pnpm build` 构建项目
   - 创建隔离临时目录（`mktemp -d`）
   - 选取随机可用端口
   - 启动 Server（`DISPATCH_DATA_DIR=$TEST_DIR/data DISPATCH_PORT=$PORT node packages/server/dist/index.js &`）
   - 如需要，启动 ClientNode

2. **执行测试场景组**
   - 场景组 1: Task CRUD 基线（创建/读取/更新/删除）
   - 场景组 2: Task 状态机（claim→progress→complete/cancel）
   - 场景组 3: Client 生命周期（注册/心跳/注销）
   - 场景组 4: 错误处理和边界条件
   - 场景组 5: 分页和过滤
   - 场景组 6: 单元测试套件（`pnpm test`）

3. **随机漫步策略**
   - 在场景组内随机交叉执行步骤
   - 随机插入干扰操作
   - 随机重复操作验证幂等性
   - 随机化参数

4. **增量写入日志（边执行边记录）**
   - 每步执行完毕后立即将以下内容追加到 `.qa/<session>/qa-log-roundN.md`：
     - **原始输入**：完整命令/HTTP 请求及所有参数
     - **原始输出**：response body 全文、status_code（不省略不截断）
     - **判断**：PASS/WARN/FAIL + 判断依据（紧跟输出之后）
   - 严禁积攒到执行结束后再回忆填写，日志是给人类审查的第一手证据链
   - 执行结束后从日志汇总生成 `.qa/<session>/qa-report-roundN.md`

### Phase 2: Issue 创建

| 判定 | 操作 | Issue 类型 |
|------|------|-----------|
| FAIL | 必须创建 | `--bug --priority P1 --label qa` |
| WARN | 酌情创建 | `--enhancement --priority P2 --label qa` |
| PASS | 不创建 | -- |

- 创建前搜索避免重复
- Issue body 包含完整复现步骤

### Phase 3: Agent 修复

- 读取每个新建 Issue
- 分析根因，修改源码
- 运行 `pnpm test:changed` 验证
- `pnpm build` 重新构建

### Phase 4: 回归验证（循环直到全部通过）

- 重新执行**完整的**测试（不仅是失败步骤）
- 如果仍有 FAIL → 回到 Phase 3 继续修复
- 循环直到 100% PASS
- 记录每轮通过率趋势

### Phase 5: 内化场景

- 将测试步骤保存为 `.agents/skills/qa-engineer/scenarios/*.json`
- 更新此文档记录经验

## 触发条件

何时应执行循环验证：

1. **功能交付时**: 新 Issue 实现完成后，执行该功能相关的 QA 场景
2. **回归测试时**: PR 合并前，执行 `pnpm test` + 相关 QA 场景
3. **手动触发**: 用户执行 `/qa run <scenario>` 或 `/qa explore`
4. **斜杠命令**: 用户执行 `/qa-loop [scope] [options]` 自动编排完整循环

## 场景文件清单

| 场景 | 文件 | 覆盖功能 |
|------|------|---------|
| server-task-crud | `scenarios/server-task-crud.json` | Task 完整 CRUD |
| server-client-lifecycle | `scenarios/server-client-lifecycle.json` | Client 生命周期 |
| server-error-handling | `scenarios/server-error-handling.json` | 错误处理和边界 |
| server-task-filtering | `scenarios/server-task-filtering.json` | 分页和过滤 |
| qa-loop-server-input-hardening | `scenarios/qa-loop-server-input-hardening.json` | 输入校验 + 字段白名单防护 |
| qa-loop-task-ownership-guard | `scenarios/qa-loop-task-ownership-guard.json` | 任务 owner 约束与越权防护 |
| qa-loop-cli-ipc-command-parity | `scenarios/qa-loop-cli-ipc-command-parity.json` | CLI/IPC 命令契约一致性 |

## 覆盖缺口（待补充）

| 场景 | 状态 | 原因 |
|------|------|------|
| CLI → IPC → ClientNode | 部分覆盖 | 已有命令契约检查；运行态 e2e 仍需补充 |
| Agent 进程管理 | 未覆盖 | 需要 ACP 实现 |
| Dispatch 引擎（tag-auto/manager/hybrid）| 未覆盖 | 需要 M4 里程碑 |
| Dashboard UI | 未覆盖 | 需要浏览器自动化 |
| 任务 artifact 上传/下载 | 未覆盖 | 需要 multipart 测试 |
| 多客户端并发 | 未覆盖 | 需要多 ClientNode 实例 |
