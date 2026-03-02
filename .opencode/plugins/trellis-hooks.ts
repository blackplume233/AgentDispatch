export const TrellisHooks = async ({ directory, worktree }) => {
  const root = worktree || directory

  const decode = (buf) => new TextDecoder().decode(buf || new Uint8Array())

  const runPython = (scriptPath, stdinText = "") => {
    const python = Bun.which("python3") || Bun.which("python")
    if (!python) return { ok: false, stdout: "", stderr: "python not found" }

    const proc = Bun.spawnSync([python, scriptPath], {
      cwd: root,
      stdin: stdinText,
      env: process.env,
    })

    return {
      ok: proc.exitCode === 0,
      stdout: decode(proc.stdout),
      stderr: decode(proc.stderr),
      code: proc.exitCode,
    }
  }

  return {
    "experimental.chat.system.transform": async (_input, output) => {
      const script = `${root}/.claude/hooks/session-start.py`
      const result = runPython(script)
      if (result.ok && result.stdout.trim()) {
        output.system.push(result.stdout.trim())
      }
    },

    "tool.execute.before": async (input, output) => {
      // Bridge Claude PreToolUse(Task) hook into OpenCode's tool.execute.before(task)
      if (input.tool !== "task") return
      if (!output?.args || !output.args.subagent_type) return

      const script = `${root}/.claude/hooks/inject-subagent-context.py`
      const payload = {
        tool_name: "Task",
        tool_input: output.args,
        cwd: root,
      }

      const result = runPython(script, JSON.stringify(payload))
      if (!result.ok || !result.stdout.trim()) return

      try {
        const parsed = JSON.parse(result.stdout)
        const updated = parsed?.hookSpecificOutput?.updatedInput
        if (updated && typeof updated === "object") {
          output.args = updated
        }
      } catch {
        // no-op: keep original args
      }
    },

    "tool.execute.after": async (input, output) => {
      // Bridge Claude SubagentStop(check) gate into OpenCode task completion.
      if (input.tool !== "task") return
      if (!input.args || input.args.subagent_type !== "check") return

      const script = `${root}/.claude/hooks/ralph-loop.py`
      const payload = {
        hook_event_name: "SubagentStop",
        subagent_type: input.args.subagent_type,
        agent_output: output?.output || "",
        prompt: input.args.prompt || "",
        cwd: root,
      }

      const result = runPython(script, JSON.stringify(payload))
      if (!result.ok || !result.stdout.trim()) return

      try {
        const parsed = JSON.parse(result.stdout)
        if (parsed?.decision === "block") {
          throw new Error(parsed.reason || "Ralph loop blocked check agent completion")
        }
      } catch (err) {
        if (err instanceof Error) throw err
      }
    },
  }
}
