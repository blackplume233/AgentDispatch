# Installation Guide

This guide walks you through installing and running AgentDispatch.

## Prerequisites

- **Node.js** >= 20.0.0
- **pnpm** >= 9.15

Check your versions:

```bash
node --version   # v20.x.x or higher
pnpm --version   # 9.15.x or higher
```

## Clone and Install

```bash
git clone <repository-url>
cd AgentDispatch
pnpm install
pnpm build
```

The `pnpm build` step compiles all packages (server, client-node, client-cli, dashboard) and must complete successfully before running any component.

## Server

Start the dispatch server (default port 9800):

```bash
pnpm --filter @agentdispatch/server dev
```

For production:

```bash
pnpm --filter @agentdispatch/server start
```

The server listens on `http://0.0.0.0:9800` by default. Configure via `server.config.json` or environment variables (see [Configuration](configuration.md)).

## Client Node

The Client Node connects to the server and runs Worker agents. It requires a `client.config.json` in the working directory.

1. Create `client.config.json` in your project directory (see [Configuration](configuration.md) for the full schema).
2. Start the Client Node:

```bash
pnpm --filter @agentdispatch/client-node dev
```

Use `DISPATCH_NODE_CONFIG` to specify a different config path:

```bash
DISPATCH_NODE_CONFIG=./my-client.config.json pnpm --filter @agentdispatch/client-node dev
```

## CLI

The `dispatch` CLI is available after `pnpm build`. Use it from the project root or add it to your PATH:

```bash
# From project root
pnpm exec dispatch --help

# Or run the built binary directly
node packages/client-cli/dist/index.js --help
```

## Dashboard

Start the web dashboard (port 3000, proxies API requests to the server):

```bash
pnpm --filter @agentdispatch/dashboard dev
```

Open `http://localhost:3000` in your browser. The dashboard proxies `/api` requests to `http://localhost:9800`, so ensure the server is running on the default port.
