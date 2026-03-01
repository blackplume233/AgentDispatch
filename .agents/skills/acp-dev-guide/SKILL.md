---
name: acp-dev-guide
description: 'ACP (Agent Client Protocol) 开发指南。提供协议规范、SDK 接口、Agent 兼容性等完整参考，指导开发者实现 ACP Agent 或 Client。触发方式：用户提及 "/acp-dev"、"ACP 开发"、"实现 ACP Agent"、"ACP SDK"、"Agent Client Protocol" 等关键词时激活。'
license: MIT
allowed-tools: Shell, Read, Write, Glob, Grep, WebFetch
---

# ACP (Agent Client Protocol) 开发指南

## 1. 协议概述

ACP 是一个标准化协议，定义了 **Client**（代码编辑器/IDE）与 **Agent**（AI 编码助手）之间的通信方式。类似于 LSP 对语言服务器的标准化作用，ACP 让任何兼容的 Agent 都能接入任何兼容的 Client。

**协议特性**：
- 基于 **JSON-RPC 2.0**
- 传输层：**stdio**（主要）、Streamable HTTP（草案）
- 消息类型：Method（请求-响应）、Notification（单向通知）
- 所有文件路径必须是**绝对路径**，行号从 **1** 开始

**角色定义**：

| 角色 | 职责 | 示例 |
|------|------|------|
| **Client** | 管理环境、处理用户交互、控制资源访问 | Zed、JetBrains IDE、VS Code、Neovim、AgentDispatch ClientNode |
| **Agent** | 使用 AI 自主修改代码，通常作为 Client 的子进程运行 | Claude Agent、Gemini CLI、Goose、自定义 Agent |

---

## 2. 官方文档与资源

### 2.1 核心文档

| 文档 | URL |
|------|-----|
| **ACP 官网** | <https://agentclientprotocol.com/> |
| **协议概览** | <https://agentclientprotocol.com/protocol/overview> |
| **初始化** | <https://agentclientprotocol.com/protocol/initialization> |
| **Session 管理** | <https://agentclientprotocol.com/protocol/session-setup> |
| **Prompt Turn 生命周期** | <https://agentclientprotocol.com/protocol/prompt-turn> |
| **文件系统操作** | <https://agentclientprotocol.com/protocol/file-system> |
| **终端操作** | <https://agentclientprotocol.com/protocol/terminals> |
| **Tool Calls** | <https://agentclientprotocol.com/protocol/tool-calls> |
| **Session 模式** | <https://agentclientprotocol.com/protocol/session-modes> |
| **内容类型** | <https://agentclientprotocol.com/protocol/content> |
| **Slash Commands** | <https://agentclientprotocol.com/protocol/slash-commands> |
| **协议扩展性** | <https://agentclientprotocol.com/protocol/extensibility> |
| **传输层** | <https://agentclientprotocol.com/protocol/transports> |
| **JSON Schema** | <https://agentclientprotocol.com/protocol/schema> |

### 2.2 生态系统

| 资源 | URL |
|------|-----|
| **兼容 Agent 列表** | <https://agentclientprotocol.com/get-started/agents> |
| **兼容 Client 列表** | <https://agentclientprotocol.com/get-started/clients> |
| **ACP Registry** | <https://agentclientprotocol.com/get-started/registry> |
| **LLMs.txt 索引** | <https://agentclientprotocol.com/llms.txt> |

---

## 3. SDK 获取与安装

### 3.1 TypeScript SDK

```bash
npm install @agentclientprotocol/sdk
```

| 资源 | URL |
|------|-----|
| NPM 包 | <https://www.npmjs.com/package/@agentclientprotocol/sdk> |
| GitHub | <https://github.com/agentclientprotocol/typescript-sdk> |
| API 文档 | <https://agentclientprotocol.github.io/typescript-sdk> |
| 示例代码 | <https://github.com/agentclientprotocol/typescript-sdk/tree/main/src/examples> |
| 生产参考（Gemini CLI） | <https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/zed-integration/zedIntegration.ts> |

**核心类**：

| 类 | 用途 |
|----|------|
| `AgentSideConnection` | **构建 Agent** — 提供 Agent 侧的 ACP 连接，实现 Client 接口 |
| `ClientSideConnection` | **构建 Client** — 提供 Client 侧的 ACP 连接，实现 Agent 接口 |
| `TerminalHandle` | 终端操作句柄（由 `createTerminal` 返回） |
| `ndJsonStream` | 将 stdin/stdout 包装为 NDJSON 双向流 |

### 3.2 Python SDK

```bash
pip install agent-client-protocol
# 或
uv add agent-client-protocol
```

| 资源 | URL |
|------|-----|
| PyPI | <https://pypi.org/project/agent-client-protocol/> |
| GitHub | <https://github.com/agentclientprotocol/python-sdk> |
| API 文档 | <https://agentclientprotocol.github.io/python-sdk/> |
| 示例代码 | <https://github.com/agentclientprotocol/python-sdk/tree/main/examples> |

**核心类/函数**：

| 类/函数 | 用途 |
|--------|------|
| `Agent` (基类) | **构建 Agent** — 子类化并实现 `prompt()` 等方法 |
| `Client` (接口) | **构建 Client** — 实现 `request_permission()`、`session_update()` |
| `run_agent()` | 启动 Agent 并监听 stdio |
| `spawn_agent_process()` | 作为 Client 启动 Agent 子进程 |
| `spawn_client_process()` | 作为 Agent 启动 Client 子进程 |
| `text_block()` | 构建文本内容块 |
| `start_tool_call()` | 构建 tool call 开始通知 |
| `update_tool_call()` | 构建 tool call 更新通知 |

### 3.3 其他 SDK

| 语言 | 文档 |
|------|------|
| Rust | <https://agentclientprotocol.com/libraries/rust> |
| Kotlin | <https://agentclientprotocol.com/libraries/kotlin> |
| 社区贡献 | <https://agentclientprotocol.com/libraries/community> |

---

## 4. 协议方法完整参考

### 4.1 Agent 实现的方法（Client → Agent）

#### 必选方法

| 方法 | 说明 |
|------|------|
| `initialize` | 协商协议版本和能力 |
| `session/new` | 创建新会话 |
| `session/prompt` | 发送用户消息 |

#### 可选方法

| 方法 | 前提条件 | 说明 |
|------|---------|------|
| `session/load` | Agent 声明 `loadSession` 能力 | 恢复已有会话 |
| `session/set_mode` | — | 切换 Agent 工作模式 |
| `authenticate` | Agent 声明 `authMethods` | 认证 |

#### 通知（Client → Agent，无响应）

| 通知 | 说明 |
|------|------|
| `session/cancel` | 取消当前 prompt turn |

### 4.2 Client 实现的方法（Agent → Client）

#### 必选方法

| 方法 | 说明 |
|------|------|
| `session/request_permission` | 请求用户授权 tool call |

#### 可选方法（取决于 Client 声明的能力）

| 方法 | 前提条件 | 说明 |
|------|---------|------|
| `fs/read_text_file` | `clientCapabilities.fs.readTextFile` | 读取文件内容 |
| `fs/write_text_file` | `clientCapabilities.fs.writeTextFile` | 写入文件内容 |
| `terminal/create` | `clientCapabilities.terminal` | 创建终端 |
| `terminal/output` | `clientCapabilities.terminal` | 获取终端输出 |
| `terminal/release` | `clientCapabilities.terminal` | 释放终端 |
| `terminal/wait_for_exit` | `clientCapabilities.terminal` | 等待终端命令退出 |
| `terminal/kill` | `clientCapabilities.terminal` | 杀死终端进程 |

#### 通知（Agent → Client，无响应）

| 通知 | 说明 |
|------|------|
| `session/update` | 会话更新（消息块、tool call、计划、命令列表、模式变更） |

### 4.3 Capability 协商

**Client Capabilities**（Client 在 `initialize` 请求中声明）：

```typescript
interface ClientCapabilities {
  fs?: {
    readTextFile?: boolean;   // 允许 Agent 读文件
    writeTextFile?: boolean;  // 允许 Agent 写文件
  };
  terminal?: boolean;         // 允许 Agent 创建/管理终端
}
```

**Agent Capabilities**（Agent 在 `initialize` 响应中声明）：

```typescript
interface AgentCapabilities {
  loadSession?: boolean;        // 支持恢复会话
  promptCapabilities?: {
    image?: boolean;            // 支持图片内容
    audio?: boolean;            // 支持音频内容
    embeddedContext?: boolean;  // 支持嵌入式上下文
  };
  mcp?: {
    http?: boolean;             // 支持 HTTP 传输的 MCP
    sse?: boolean;              // 支持 SSE 传输的 MCP（已弃用）
  };
}
```

---

## 5. 消息流完整生命周期

### 5.1 初始化

```
Client → Agent:  initialize { protocolVersion, clientCapabilities, clientInfo }
Agent → Client:  initialize response { protocolVersion, agentCapabilities, agentInfo, authMethods }
```

### 5.2 创建会话

```
Client → Agent:  session/new { cwd, mcpServers }
Agent → Client:  response { sessionId }
```

### 5.3 Prompt Turn 循环

```
Client → Agent:  session/prompt { sessionId, prompt: ContentBlock[] }

  ┌─ Agent 处理循环 ─────────────────────────────────┐
  │                                                    │
  │  Agent → Client: session/update (plan)             │
  │  Agent → Client: session/update (agent_message)    │
  │                                                    │
  │  if tool call:                                     │
  │    Agent → Client: session/update (tool_call)      │
  │    Agent → Client: request_permission (可选)        │
  │    Client → Agent: permission response             │
  │    Agent → Client: session/update (in_progress)    │
  │    Agent → Client: session/update (completed)      │
  │    → 将结果送回 LLM，继续循环                         │
  │                                                    │
  │  if cancelled:                                     │
  │    Client → Agent: session/cancel                  │
  │    Agent → Client: prompt response (cancelled)     │
  │                                                    │
  └────────────────────────────────────────────────────┘

Agent → Client:  session/prompt response { stopReason }
```

**StopReason 类型**：

| 值 | 含义 |
|----|------|
| `end_turn` | LLM 正常完成 |
| `max_tokens` | 达到 token 上限 |
| `max_model_requests` | 达到模型请求次数上限 |
| `refused` | Agent 拒绝继续 |
| `cancelled` | Client 取消 |

### 5.4 session/update 通知类型

| sessionUpdate 值 | 含义 |
|------------------|------|
| `agent_message_chunk` | Agent 消息文本块（流式） |
| `user_message_chunk` | 用户消息块（会话恢复时） |
| `tool_call` | 新的 tool call |
| `tool_call_update` | tool call 状态更新 |
| `plan` | Agent 执行计划 |
| `commands_update` | 可用 slash commands 更新 |
| `mode_change` | Agent 模式变更 |

---

## 6. 实现 ACP Agent（TypeScript）

### 6.1 最小 Agent

```typescript
import { AgentSideConnection, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk';
import type { Agent, StopReason } from '@agentclientprotocol/sdk';

const stream = ndJsonStream(process.stdin, process.stdout);

const connection = new AgentSideConnection(
  (conn): Agent => ({
    initialize: async (params) => ({
      protocolVersion: PROTOCOL_VERSION,
      agentCapabilities: {},
      agentInfo: { name: 'my-agent', version: '1.0.0' },
      authMethods: [],
    }),

    newSession: async (params) => ({
      sessionId: `sess_${Date.now()}`,
    }),

    prompt: async (params) => {
      const text = params.prompt
        .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
        .map((b) => b.text)
        .join('\n');

      await conn.sessionUpdate({
        sessionId: params.sessionId,
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: `Echo: ${text}` },
        },
      });

      return { stopReason: 'end_turn' as StopReason };
    },
  }),
  stream,
);

await connection.closed;
```

### 6.2 使用 Client 能力（读写文件、终端）

```typescript
prompt: async (params) => {
  // 读文件（仅当 Client 声明了 fs.readTextFile）
  const file = await conn.readTextFile({
    sessionId: params.sessionId,
    path: '/absolute/path/to/file.ts',
  });

  // 写文件（仅当 Client 声明了 fs.writeTextFile）
  await conn.writeTextFile({
    sessionId: params.sessionId,
    path: '/absolute/path/to/output.ts',
    content: '// generated code',
  });

  // 创建终端（仅当 Client 声明了 terminal）
  const terminal = await conn.createTerminal({
    sessionId: params.sessionId,
    command: 'npm',
    args: ['test'],
    cwd: '/project/root',
  });
  const output = await terminal.waitForExit();

  // 请求用户授权
  const permission = await conn.requestPermission({
    sessionId: params.sessionId,
    toolCall: { toolCallId: 'call_001' },
    options: [
      { optionId: 'allow', name: 'Allow', kind: 'allow_once' },
      { optionId: 'reject', name: 'Reject', kind: 'reject_once' },
    ],
  });

  return { stopReason: 'end_turn' };
}
```

---

## 7. 实现 ACP Agent（Python）

### 7.1 最小 Agent

```python
import asyncio
from acp import Agent, PromptResponse, run_agent

class EchoAgent(Agent):
    async def initialize(self, protocol_version, client_capabilities, **kw):
        return {
            "protocolVersion": 1,
            "agentCapabilities": {},
            "agentInfo": {"name": "echo-agent", "version": "1.0.0"},
            "authMethods": [],
        }

    async def new_session(self, cwd, mcp_servers=None, **kw):
        return {"sessionId": f"sess_{id(self)}"}

    async def prompt(self, prompt, session_id, **kw) -> PromptResponse:
        text = " ".join(b["text"] for b in prompt if b.get("type") == "text")
        await self.connection.session_update(
            session_id=session_id,
            update={
                "sessionUpdate": "agent_message_chunk",
                "content": {"type": "text", "text": f"Echo: {text}"},
            },
        )
        return PromptResponse(stop_reason="end_turn")

if __name__ == "__main__":
    asyncio.run(run_agent(EchoAgent()))
```

### 7.2 作为 Client 启动 Agent

```python
import asyncio
from acp import spawn_agent_process, text_block
from acp.interfaces import Client

class MyClient(Client):
    async def request_permission(self, options, session_id, tool_call, **kw):
        return {"outcome": {"outcome": "selected", "optionId": options[0]["optionId"]}}

    async def session_update(self, session_id, update, **kw):
        print(f"[{session_id}] {update}")

async def main():
    async with spawn_agent_process(
        MyClient(), "gemini", "--experimental-acp"
    ) as (conn, proc):
        await conn.initialize(protocol_version=1)
        session = await conn.new_session(cwd="/my/project", mcp_servers=[])
        result = await conn.prompt(
            session_id=session.session_id,
            prompt=[text_block("Explain this codebase")],
        )
        print(f"Stop reason: {result.stop_reason}")

asyncio.run(main())
```

---

## 8. 实现 ACP Client（TypeScript）

AgentDispatch 的 ClientNode 就是一个 ACP Client 的实现。核心步骤：

```typescript
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk';
import { spawn } from 'node:child_process';

// 1. 启动 Agent 子进程
const proc = spawn('gemini', ['--experimental-acp'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  cwd: '/project/root',
});

// 2. 建立 ACP 连接
const stream = ndJsonStream(proc.stdout, proc.stdin);
const connection = new ClientSideConnection(
  (_agent) => ({
    // Client 实现的方法
    requestPermission: async (params) => ({
      outcome: { outcome: 'selected', optionId: params.options[0].optionId },
    }),
    readTextFile: async (params) => ({
      content: await fs.readFile(params.path, 'utf-8'),
    }),
    writeTextFile: async (params) => {
      await fs.writeFile(params.path, params.content, 'utf-8');
      return null;
    },
    sessionUpdate: async (params) => {
      console.log('Update:', JSON.stringify(params.update));
    },
  }),
  stream,
);

// 3. 初始化
const initResult = await connection.initialize({
  protocolVersion: PROTOCOL_VERSION,
  clientCapabilities: {
    fs: { readTextFile: true, writeTextFile: true },
    terminal: true,
  },
  clientInfo: { name: 'my-client', version: '1.0.0' },
});

// 4. 创建会话
const session = await connection.newSession({
  cwd: '/project/root',
  mcpServers: [],
});

// 5. 发送 prompt
const result = await connection.prompt({
  sessionId: session.sessionId,
  prompt: [{ type: 'text', text: 'Review the code in src/' }],
});
```

---

## 9. 常用 Agent 的 ACP 支持形态

> **核心规律**：几乎所有 Agent CLI 的默认模式是交互式终端，需要特定子命令/标志才能进入 ACP stdio 模式。

### 9.1 分类总览

| 类型 | 特征 | 代表 |
|------|------|------|
| **子命令风格** | `command acp` 启动 ACP 模式 | Goose、OpenCode、Kiro、Kimi、OpenHands |
| **标志风格** | `command --acp` 启动 ACP 模式 | Cline、Augment(auggie)、Qwen Code(qwen)、Gemini(--experimental-acp) |
| **独立适配器** | 适配器二进制本身就是 ACP 模式 | claude-agent-acp、codex-acp、vibe-acp、pi-acp |

### 9.2 完整命令参考

| Agent | command | args | 安装方式 |
|-------|---------|------|---------|
| **Claude Agent** | `claude-agent-acp` | — | `npm i -g @zed-industries/claude-agent-acp` |
| **Codex CLI** | `codex-acp` | — | `npm i -g @zed-industries/codex-acp` |
| **Gemini CLI** | `gemini` | `["--experimental-acp"]` | `npm i -g @google/gemini-cli` |
| **Goose** | `goose` | `["acp"]` | [block.github.io/goose](https://block.github.io/goose/docs/guides/acp-clients) |
| **OpenCode** | `opencode` | `["acp"]` | [open-code.ai](https://open-code.ai/docs/en/acp) |
| **Kiro CLI** | `kiro` | `["acp"]` | [kiro.dev/cli](https://kiro.dev/cli/) |
| **Kimi CLI** | `kimi` | `["acp"]` | [MoonshotAI/kimi-cli](https://github.com/MoonshotAI/kimi-cli) |
| **Augment Code** | `auggie` | `["--acp"]` | [docs.augmentcode.com](https://docs.augmentcode.com/cli/acp/agent) |
| **Cline** | `cline` | `["--acp"]` | [docs.cline.bot](https://docs.cline.bot/cline-cli/acp-editor-integrations) |
| **Qwen Code** | `qwen` | `["--acp"]` | `npm i -g @qwen-code/qwen-code` |
| **Mistral Vibe** | `vibe-acp` | — | [mistralai/mistral-vibe](https://github.com/mistralai/mistral-vibe/blob/main/docs/acp-setup.md) |
| **OpenHands** | `openhands` | `["acp"]` | [docs.openhands.dev](https://docs.openhands.dev/openhands/usage/run-openhands/acp) |

### 9.3 常见错误

```jsonc
// ❌ 错误 — 启动交互终端，不是 ACP
{ "command": "gemini" }
{ "command": "cline" }

// ✅ 正确 — 进入 ACP stdio 模式
{ "command": "gemini", "args": ["--experimental-acp"] }
{ "command": "cline",  "args": ["--acp"] }
```

---

## 10. 调试与测试

### 10.1 手动测试 ACP Agent

通过管道直接向 Agent 发送 JSON-RPC 消息：

```bash
echo '{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":1,"clientCapabilities":{"fs":{"readTextFile":true,"writeTextFile":true},"terminal":true},"clientInfo":{"name":"test","version":"0.1.0"}}}' | gemini --experimental-acp
```

### 10.2 使用 acpx CLI 测试

[acpx](https://github.com/openclaw/acpx) 是一个通用 ACP CLI 客户端：

```bash
npx acpx gemini --experimental-acp
```

### 10.3 在 Zed 中验证

在 `~/.config/zed/settings.json` 中添加自定义 Agent：

```json
{
  "agent_servers": {
    "My Agent": {
      "type": "custom",
      "command": "node",
      "args": ["./dist/my-agent.js"]
    }
  }
}
```

---

## 11. 协议 JSON Schema

完整的协议 JSON Schema 可从以下地址获取：

- <https://agentclientprotocol.com/protocol/schema>
- <https://agentclientprotocol.com/api-reference/openapi.json>

TypeScript SDK 中的类型定义直接从 Schema 生成，可作为实现参考。

---

## 12. 开发检查清单

实现新的 ACP Agent 或 Client 前，确认以下事项：

| 检查项 | 说明 |
|--------|------|
| stdio 通信 | 通过 stdin/stdout 使用 NDJSON 格式的 JSON-RPC 2.0 |
| stderr 仅用于日志 | stdout 不能混入非 JSON-RPC 内容 |
| `initialize` 握手 | 必须实现版本协商和能力交换 |
| `session/new` | 必须返回唯一 sessionId |
| `session/prompt` | 必须处理 prompt 并返回 StopReason |
| `session/cancel` | 必须优雅处理取消，返回 `cancelled` stop reason |
| 能力检查 | 调用 Client 方法前必须检查对应 capability |
| 绝对路径 | 所有文件路径必须是绝对路径 |
| 行号从 1 开始 | 不是 0-based |
