# Troubleshooting Guide

Common issues when deploying and operating AgentDispatch, with solutions.

---

## Process Management

### Duplicate Processes

**Symptom**: Port already in use; multiple `vite preview`, `client-node`, or `claude-agent-acp` processes running.

**Cause**: Repeated `nohup` starts without stopping previous instances; crashed workers auto-restarting while old PIDs remain.

**Fix**:

```bash
# Identify processes by port
lsof -i :9800       # Server
lsof -i :3000       # Dashboard

# Kill all AgentDispatch processes
pkill -f "packages/server/dist/index.js"
pkill -f "packages/client-node/dist/main.js"
pkill -f "vite preview"
pkill -f "claude-agent-acp"

# Force-free ports
fuser -k 9800/tcp
fuser -k 3000/tcp
```

**Prevention**: Use a process manager (`systemd`, `pm2`, Docker) instead of `nohup`:

```bash
pm2 start "node packages/server/dist/index.js" --name dispatch-server
pm2 start "node packages/client-node/dist/main.js" --name dispatch-client
pm2 save && pm2 startup
```

---

## CORS & Remote Dashboard Access

### Dashboard Shows "Unable to connect to server"

**Symptom**: Dashboard loads from a remote device but shows connection error; browser console reports CORS failures.

**Cause**: Dashboard defaults to proxying API requests to `localhost:9800`. When opened from another device, the browser resolves `localhost` to the device's own loopback — not the server.

**Fix**: Set `VITE_API_URL` to the server's network address when starting Dashboard:

```bash
VITE_DASHBOARD_HOST=0.0.0.0 \
VITE_API_URL=http://<server-ip>:9800 \
pnpm --filter @agentdispatch/dashboard preview --port 3000
```

See [Configuration Guide — Dashboard Remote Access](configuration.md#dashboard-远程访问) for full details.

### Auth Flicker (Login Loop)

**Symptom**: Dashboard rapidly flickers between login page and main UI.

**Cause**: Same root as above — `/health` and `/api/v1/auth/me` requests fail due to CORS or wrong API target, causing the auth state check to continuously toggle.

**Fix**: Same as above — set `VITE_API_URL` to the correct server address.

---

## Port Conflicts

**Symptom**: "Port 3000 is in use, trying another one…" (Dashboard auto-switches to 3001/3002/…) or Server fails to bind 9800.

**Cause**: Previous processes did not exit cleanly; system `TIME_WAIT` sockets still holding the port.

**Fix**:

```bash
# Check what's using the port
lsof -i :3000
ss -tlnp | grep :3000

# Force-release
fuser -k 3000/tcp
```

---

## Nested Claude Sessions

**Symptom**: `claude-agent-acp` Worker immediately exits with:
```
Error: Claude Code cannot be launched inside another Claude Code session.
```

**Cause**: The current shell is running inside a Claude Code session (`CLAUDECODE` or `CLAUDE_CODE` environment variable is set). The adapter detects this and refuses to start.

**Fix**: Create a wrapper script that clears the environment before launching:

```bash
#!/bin/bash
unset CLAUDECODE CLAUDE_CODE
exec claude-agent-acp "$@"
```

Then reference the wrapper in `client.config.json`:

```json
{ "command": "/path/to/claude-wrapper.sh" }
```

**Detection**: Check if `CLAUDECODE` or `CLAUDE_CODE` is set in the current environment.

---

## inotify Limits (Linux)

**Symptom**: Worker fails to start with:
```
Error: EMFILE: too many open files, watch '/home/user/.claude'
```

**Cause**: Linux `fs.inotify.max_user_instances` defaults to 128. File-watching Agent processes (Claude, IDE integrations, Docker) quickly exhaust this.

**Fix**:

```bash
# Check current limit
cat /proc/sys/fs/inotify/max_user_instances

# Increase temporarily
sudo sysctl fs.inotify.max_user_instances=8192

# Persist across reboots
echo "fs.inotify.max_user_instances=8192" | sudo tee /etc/sysctl.d/99-inotify.conf
sudo sysctl --system
```

---

## CORS with Reverse Proxy

Server has built-in CORS support via `@fastify/cors`. If you place Nginx or another reverse proxy in front, **do not** add duplicate CORS headers — browsers reject responses with doubled `Access-Control-Allow-Origin`.

---

## Deployment Checklist

| Item | Details |
|------|---------|
| Node.js >= 20 | Required for Server, Client Node, and Worker agents |
| `pnpm build` succeeds | All packages compile without errors |
| Ports available | 9800 (Server), 3000 (Dashboard) |
| API Keys set | `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc. as needed |
| inotify limit (Linux) | `max_user_instances >= 8192` |
| Process manager | pm2 / systemd / Docker (not `nohup`) |
| Firewall | Open 9800 and 3000 for remote access |
| Dashboard `VITE_API_URL` | Set to server's network IP for remote access |
| Auth configured | Enable `auth` in `server.config.json` when exposing to network |
