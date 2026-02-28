# AgentDispatch

A task dispatch platform for AI agents, supporting automated task distribution, execution monitoring, and artifact management.

## Architecture

AgentDispatch uses a CS-style distributed architecture with five modules:

- **Server** -- Task hub with REST API and file-based persistence
- **ClientNode** -- Client runtime managing Agent clusters via ACP protocol
- **ClientCLI** -- Command-line interface for Node control and Worker communication
- **Dashboard** -- Web-based visualization for tasks and clients
- **Shared** -- Cross-module types, errors, and utilities

## Quick Start

### Prerequisites

- Node.js >= 20.0.0
- pnpm >= 9.15.0

### Setup

```bash
git clone <repo-url> && cd AgentDispatch
pnpm install
pnpm build
```

### Development Commands

```bash
pnpm build        # Build all packages
pnpm test         # Run all tests
pnpm lint         # Lint all packages
pnpm type-check   # Type-check all packages
pnpm clean        # Clean all build outputs
```

### Running the Server

```bash
pnpm --filter @agentdispatch/server dev
```

### Running the Dashboard

```bash
pnpm --filter @agentdispatch/dashboard dev
```

## Project Structure

```
packages/
  server/          # REST API server (Fastify)
  client-node/     # Client runtime (ACP, IPC, dispatch engine)
  client-cli/      # CLI tool (commander)
  dashboard/       # Web UI (React + Vite + shadcn/ui)
  shared/          # Shared types and utilities
doc/               # Project documentation
.trellis/          # Development workflow and specs
```

## Configuration

- Server: `server.config.json` (default port: 9800)
- Client: `client.config.json`
- Environment variables: `DISPATCH_*` prefix

See `doc/` for detailed documentation.

## License

Private
