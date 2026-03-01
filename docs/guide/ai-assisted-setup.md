# AI 辅助安装指南 — AgentDispatch

> 本文件供 AI Agent 阅读后执行。人类用户请将下方指令发送给你的 AI Agent。

---

## AI 执行指令

当你（AI Agent）被要求安装和配置 AgentDispatch 时，请按以下三个阶段顺序执行。

### 前置准备

在执行任何步骤前，先阅读项目中的使用指南技能文件以获取完整参考：

```
.agents/skills/agent-dispatch-use/SKILL.md
```

该文件包含：
- 完整架构说明
- ACP 兼容 Agent 列表及其安装方式
- `client.config.json` 全部字段定义
- Agent 挂载原理和生命周期
- 端到端示例

---

## 第一阶段：环境检测与安装（AI 自动执行）

以下步骤无需用户参与，直接执行：

### 1. 检测运行环境

```bash
node --version   # 要求 >= 20.0.0
pnpm --version   # 要求 >= 9.15
```

- 如果 Node.js 未安装或版本不足，引导用户安装（推荐 [nvm](https://github.com/nvm-sh/nvm) 或 [fnm](https://github.com/Schniz/fnm)）
- 如果 pnpm 未安装，执行 `corepack enable && corepack prepare pnpm@latest --activate` 或 `npm install -g pnpm`

### 2. 克隆与构建

```bash
git clone https://github.com/blackplume233/AgentDispatch.git
cd AgentDispatch
pnpm install
pnpm build
```

构建失败时检查 Node.js 版本和网络连通性。

### 3. 启动 Server 并验证

```bash
pnpm --filter @agentdispatch/server dev
```

等待服务就绪后验证：

```bash
curl http://localhost:9800/health
# 预期: {"status":"ok","version":"...","authEnabled":false}
```

---

## 第二阶段：交互式配置（AI 引导用户决策）

以下内容需要**询问用户**后才能确定。请逐项向用户提问。

### 4. 选择 Worker Agent

向用户展示 ACP 兼容 Agent 列表，并询问要使用哪些：

| Agent | ACP 支持 | command | args | 安装命令 |
|-------|---------|---------|------|---------|
| **Claude** | 适配器 | `claude-agent-acp` | — | `npm i -g @zed-industries/claude-agent-acp` |
| **Codex** | 适配器 | `codex-acp` | — | `npm i -g @zed-industries/codex-acp` |
| **Gemini** | 原生 | `gemini` | `["--experimental-acp"]` | `npm i -g @google/gemini-cli` |
| **Goose** | 原生 | `goose` | `["acp"]` | [block.github.io/goose](https://block.github.io/goose) |
| **OpenCode** | 原生 | `opencode` | `["acp"]` | [open-code.ai](https://open-code.ai) |
| **Kiro** | 原生 | `kiro` | `["acp"]` | [kiro.dev/cli](https://kiro.dev/cli/) |
| **Kimi** | 原生 | `kimi` | `["acp"]` | [github.com/MoonshotAI/kimi-cli](https://github.com/MoonshotAI/kimi-cli) |
| **Augment** | 原生 | `auggie` | `["--acp"]` | [docs.augmentcode.com](https://docs.augmentcode.com/cli/acp/agent) |
| **Cline** | 原生 | `cline` | `["--acp"]` | [docs.cline.bot](https://docs.cline.bot/cline-cli/acp-editor-integrations) |
| **Qwen Code** | 原生 | `qwen` | `["--acp"]` | `npm i -g @qwen-code/qwen-code` |

**需要问用户的问题**：
- "你想使用哪些 AI Agent 作为 Worker？（可多选，或告诉我你已有哪些 Agent CLI）"

根据用户的选择，执行对应的安装命令（如 `npm i -g @zed-industries/claude-agent-acp`）。

### 5. 安装适配器 / CLI 并验证 API Key

根据用户选择的 Agent：

- 需要适配器的（Claude、Codex）：安装对应的 npm 包
- 原生支持的（Gemini、Goose 等）：确认 CLI 已在 PATH 中
- 检查对应的 API Key 环境变量是否已设置（如 `ANTHROPIC_API_KEY`、`OPENAI_API_KEY`、`GEMINI_API_KEY`）

**需要问用户的问题**（如果 API Key 未设置）：
- "请设置 `{KEY_NAME}` 环境变量，或告诉我你的 API Key（我会帮你写入 .env）"

### 6. 确定任务标签和分发模式

**需要问用户的问题**：
- "你的 Agent 集群主要处理哪类任务？（例如：code-review, testing, docs, refactor, general）"
- "你希望使用哪种分发模式？"
  - `tag-auto` — 按标签规则自动匹配 Worker（推荐初次使用）
  - `manager` — 由 AI Manager Agent 智能调度
  - `hybrid` — Manager 在线走 AI 调度，离线回退规则匹配

### 7. 生成 client.config.json

根据第 4–6 步收集到的信息，自动生成配置文件。模板：

```json
{
  "name": "{node-name}",
  "serverUrl": "http://localhost:9800",
  "tags": ["{用户选择的标签}"],
  "dispatchMode": "{用户选择的模式}",
  "autoDispatch": {
    "rules": [
      {
        "taskTags": ["{标签}"],
        "targetAgentId": "{worker-id}",
        "priority": 10
      }
    ],
    "fallbackAction": "skip"
  },
  "agents": [
    {
      "id": "{worker-id}",
      "type": "worker",
      "command": "{对应 Agent 的 command}",
      "args": ["{对应 Agent 的 args}"],
      "workDir": "./workspace/{worker-id}",
      "capabilities": ["{标签/能力}"],
      "acpCapabilities": {
        "fs": { "readTextFile": true, "writeTextFile": true },
        "terminal": true
      },
      "permissionPolicy": "auto-allow"
    }
  ]
}
```

为每个用户选择的 Worker 生成一条 agent 配置和对应的 dispatch rule。

如果用户选择了 `manager` 或 `hybrid` 模式，额外生成一条 `type: "manager"` 的 Agent 配置。

---

## 第三阶段：启动与验证（AI 自动执行）

### 8. 创建工作目录

为每个 Worker 创建 `workDir`：

```bash
mkdir -p ./workspace/{worker-id}
```

### 9. 启动 Client Node

```bash
pnpm --filter @agentdispatch/client-node dev
```

验证节点注册成功：

```bash
curl http://localhost:9800/api/v1/clients
# 预期: 列表中出现刚注册的 Client Node
```

### 10. 启动 Dashboard

```bash
pnpm --filter @agentdispatch/dashboard dev
# Dashboard at http://localhost:3000
```

### 11. 端到端验证

创建一个测试任务，验证完整链路：

```bash
curl -X POST http://localhost:9800/api/v1/tasks \
  -H "Content-Type: application/json" \
  -d '{"title": "Setup verification task", "tags": ["{用户的标签}"], "priority": "normal"}'
```

向用户报告验证结果：
- Server 是否健康
- Client Node 是否注册成功
- Worker Agent 是否被正确启动
- 测试任务是否被自动领取

---

## 完成提示

安装验证通过后，向用户展示以下信息：

```
AgentDispatch 安装完成！

  Server:    http://localhost:9800
  Dashboard: http://localhost:3000
  CLI:       pnpm exec dispatch --help

已挂载的 Worker:
  - {worker-id} ({agent-type}) → tags: [{标签}]

下一步:
  - 通过 Dashboard 或 curl 创建任务，Worker 会自动领取执行
  - 查看完整文档: docs/guide/
  - CLI 参考: pnpm exec dispatch --help
```
