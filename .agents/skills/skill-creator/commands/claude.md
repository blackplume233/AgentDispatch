# Create Command or Skill (Claude Code)

统一管理 Trellis 的 `create-command` / `create-skill` 能力。

## 支持命令

- `/trellis:create-command <name> <description>`
- `/trellis:create-skill <skill-name> [description]`
- 兼容旧别名：`/trellis:integrate-skill ...`（按 create-skill 流程处理）

## 用户输入

$ARGUMENTS

## 核心约束

1. **真实内容必须写入 `.agents/`**。
2. `.claude/`、`.cursor/`、`.opencode/` 只保留薄引用（wrapper）。
3. 新增命令或技能时，三端都要可用。

## 执行流程

### A. 当用户要创建 command

1. 解析 `<name>` 和 `<description>`。
2. 在 `.agents/skills/<skill-or-domain>/commands/` 写入真实命令内容（建议至少包含 `claude.md`、`cursor.md`、`opencode.md` 三份平台入口）。
3. 创建三端 wrapper：
   - `.claude/commands/trellis/<name>.md`
   - `.cursor/commands/trellis-<name>.md`
   - `.opencode/commands/trellis/<name>.md`
4. wrapper 仅引用 `.agents/...` 的真实内容。

### B. 当用户要创建 skill

1. 在 `.agents/skills/<skill-name>/` 创建：
   - `SKILL.md`
   - `commands/claude.md`
   - `commands/cursor.md`
   - `commands/opencode.md`
2. 若技能暴露为 Trellis 命令，再创建对应三端 wrapper（同上）。
3. 保证技能描述包含触发条件和使用场景。

## Wrapper 模板

Claude wrapper (`.claude/commands/trellis/<name>.md`)：

```md
读取并执行统一能力文档：

@.agents/skills/<skill-name>/commands/claude.md

用户指令：$ARGUMENTS
```

## 输出格式

```md
[OK] Completed

Mode: create-command | create-skill
Primary source:

- .agents/skills/...

Wrappers:

- .claude/commands/...
- .cursor/commands/...
- .opencode/commands/...
```
