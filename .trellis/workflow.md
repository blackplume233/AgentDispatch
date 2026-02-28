# Development Workflow

> Based on [Effective Harnesses for Long-Running Agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)

---

## Table of Contents

1. [Quick Start (Do This First)](#quick-start-do-this-first)
2. [Workflow Overview](#workflow-overview)
3. [Session Start Process](#session-start-process)
4. [Development Process](#development-process)
5. [Session End](#session-end)
6. [File Descriptions](#file-descriptions)
7. [Best Practices](#best-practices)

---

## Quick Start (Do This First)

### Step 0: Initialize Developer Identity (First Time Only)

> **Multi-developer support**: Each developer/Agent needs to initialize their identity first.

```bash
# Check if already initialized
./.trellis/scripts/get-developer.sh

# If not initialized, run:
./.trellis/scripts/init-developer.sh <your-name>
# Example: ./.trellis/scripts/init-developer.sh actant-cursor-agent
```

This creates:
- `.trellis/.developer` - Your identity file (gitignored, not committed)
- `.trellis/workspace/<your-name>/` - Your personal workspace directory

**Naming conventions**:

| Agent Type | Recommended Name | Notes |
|-----------|---------|------|
| Cursor AI | `actant-cursor-agent` | Use `/trellis-plan-start` to start session |
| Claude Code | `actant-claude-agent` | Use `/trellis:plan-start` to start session |
| Human developer | `actant-<your-name>` | e.g., `actant-john-doe` |
| Task-scoped agent | `actant-<platform>-<task>` | e.g., `actant-cursor-refactor` |

### Step 1: Understand Current Context

```bash
# Get full context in one command
./.trellis/scripts/get-context.sh

# Or check manually:
./.trellis/scripts/get-developer.sh      # Your identity
./.trellis/scripts/task.sh list          # Active tasks
git status && git log --oneline -10      # Git state
```

### Step 2: Read Project Guidelines [MANDATORY]

**CRITICAL**: Read guidelines before writing any code:

```bash
# Read frontend guidelines index (if applicable)
cat .trellis/spec/frontend/index.md

# Read backend guidelines index (if applicable)
cat .trellis/spec/backend/index.md
```

### Step 3: Before Coding - Read Specific Guidelines (Required)

Based on your task, read the **detailed** guidelines under `.trellis/spec/`.

---

## Workflow Overview

### Core Principles

1. **Read Before Write** - Understand context before starting
2. **Follow Standards** - [!] **MUST read `.trellis/spec/` guidelines before coding**
3. **Incremental Development** - Complete one task at a time
4. **Record Promptly** - Update tracking files immediately after completion
5. **Document Limits** - [!] **Max 2000 lines per journal document**

### File System

```
.trellis/
|-- .developer           # Developer identity (gitignored)
|-- scripts/
|   |-- common/              # Shared utilities
|   |   |-- paths.sh         # Path utilities
|   |   |-- developer.sh     # Developer management
|   |   \-- git-context.sh   # Git context implementation
|   |-- init-developer.sh    # Initialize developer identity
|   |-- get-developer.sh     # Get current developer name
|   |-- task.sh              # Manage tasks (active work)
|   |-- get-context.sh       # Get session context
|   \-- add-session.sh       # One-click session recording
|-- workspace/           # Developer workspaces
|   |-- index.md         # Workspace index + Session template
|   \-- {developer}/     # Per-developer directories
|       |-- index.md     # Personal index (with @@@auto markers)
|       \-- journal-N.md # Journal files (sequential numbering)
|-- tasks/               # Task tracking (active work)
|   \-- {MM}-{DD}-{name}/
|       \-- task.json
|-- issues/              # Issue tracking (backlog)
|   |-- .counter         # Auto-increment ID counter
|   \-- {NNNN}-{slug}.md    # Obsidian Markdown issue files
|-- roadmap.md           # Product roadmap
|-- spec/                # [!] MUST READ before coding
|   |-- index.md                 # Spec overview
|   |-- config-spec.md           # Configuration specification
|   |-- api-contracts.md         # Interface contracts
|   |-- frontend/        # Frontend implementation guidelines
|   |   \-- index.md
|   |-- backend/         # Backend implementation guidelines
|   |   \-- index.md
|   \-- guides/          # Thinking guides
|       |-- index.md
|       |-- cross-layer-thinking-guide.md
|       \-- code-reuse-thinking-guide.md
\-- workflow.md             # This document
```

---

## Session Start Process

### Step 1: Get Session Context

```bash
./.trellis/scripts/get-context.sh
```

### Step 2: Read Development Guidelines [!] REQUIRED

Based on what you'll develop, read the corresponding guidelines under `.trellis/spec/`.

### Step 3: Select Task to Develop

```bash
# List active tasks
./.trellis/scripts/task.sh list

# Create new task
./.trellis/scripts/task.sh create "<title>" --slug <task-name>
```

---

## Development Process

### Task Development Flow

```
1. Create or select task
   \-> ./.trellis/scripts/task.sh create "<title>" --slug <name>

2. Write code according to guidelines
   \-> Read .trellis/spec/ docs relevant to your task

3. Self-test
   \-> Run project's lint/test commands
   \-> Manual feature testing

4. Pre-commit check
   \-> git add <files>
   \-> git commit -m "type(scope): description"
       Format: feat/fix/docs/refactor/test/chore

5. Record session
   \-> ./.trellis/scripts/add-session.sh --title "Title" --commit "hash"
```

### Code Quality Checklist

**⚠️ Interface / Contract changes (CRITICAL — 接口变更必须逐项确认)**:
- [!] Did this change touch any API endpoint, DTO, IPC message, or error code? → **STOP: update `spec/api-contracts.md` FIRST, tag `[BREAKING]`/`[CHANGED]`**
- [!] Did this change touch any config field, env var, or schema? → **STOP: update `spec/config-spec.md` FIRST, tag `[BREAKING]`/`[CHANGED]`**
- [!] All affected consumer modules identified and their tests updated?
- [!] Commit message uses `feat(api)!:` for breaking changes?

**Doc sync (general)**:
- [OK] If configuration fields or schemas changed → update `spec/config-spec.md`
- [OK] If APIs, CLI commands, or error codes changed → update `spec/api-contracts.md`

---

## Session End

### One-Click Session Recording

```bash
./.trellis/scripts/add-session.sh \
  --title "Session Title" \
  --commit "abc1234" \
  --summary "Brief summary"
```

### Pre-end Checklist

1. [OK] All code committed, commit message follows convention
2. [OK] Session recorded via `add-session.sh`
3. [OK] No lint/test errors
4. [OK] Working directory clean (or WIP noted)
5. [OK] Spec docs updated if needed

---

## File Descriptions

### 1. workspace/ - Developer Workspaces

**Purpose**: Record each AI Agent session's work content

**Structure**:
```
workspace/
|-- index.md              # Main index (Active Developers table)
\-- {developer}/          # Per-developer directory
    |-- index.md          # Personal index
    \-- journal-N.md      # Journal files (sequential: 1, 2, 3...)
```

### 2. spec/ - Development Guidelines

**Purpose**: Documented standards for consistent development

### 3. Tasks - Active Work Tracking

Each task is a directory containing `task.json`:

```
tasks/
|-- 01-21-my-task/
|   \-- task.json
\-- archive/
    \-- 2026-01/
        \-- 01-15-old-task/
            \-- task.json
```

**Commands**:
```bash
./.trellis/scripts/task.sh create "<title>" [--slug <name>]
./.trellis/scripts/task.sh archive <name>
./.trellis/scripts/task.sh list
```

### 4. Issues - Backlog Tracking (GitHub-first)

> **GitHub Issues is the single source of truth.**
> Local `.trellis/issues/` files are Obsidian-compatible cache mirrors.

**Issue vs Task**:

| Concept | Issue | Task |
|---------|-------|------|
| Purpose | Backlog — what needs doing | Active work — what's being done now |
| Lifecycle | open → in-progress → closed → archived | planning → in_progress → completed |
| Transition | `promote` creates a Task | `archive` archives completed Task |

**Workflow**: GitHub Issue → local cache → promote → Task → close → archive → Done

---

## Best Practices

### [OK] DO

1. Run `./.trellis/scripts/get-context.sh` before session start
2. [!] **MUST read** relevant `.trellis/spec/` docs
3. Follow `.trellis/spec/` guidelines and Code Quality Checklist
4. Develop only one task at a time
5. Use `add-session.sh` to record progress

### [X] DON'T

1. [!] **Don't** skip reading `.trellis/spec/` guidelines
2. [!] **Don't** let journal single file exceed 2000 lines
3. **Don't** develop multiple unrelated tasks simultaneously
4. **Don't** commit code with lint/test errors

---

## Quick Reference

### Commit Convention

```bash
git commit -m "type(scope): description"
```

**Type**: feat, fix, docs, refactor, test, chore
**Scope**: Module name (e.g., auth, api, ui)

### Common Commands

```bash
# Session management
./.trellis/scripts/get-context.sh
./.trellis/scripts/add-session.sh

# Task management
./.trellis/scripts/task.sh list
./.trellis/scripts/task.sh create "<title>"

# Issue management (GitHub-first)
gh issue list --state open
gh issue create -t "<title>" -b "<body>" -l "feature"

# Slash commands
/trellis:finish-work
/trellis:check-cross-layer
```

---

## Summary

Following this workflow ensures:
- [OK] Continuity across multiple sessions
- [OK] Consistent code quality
- [OK] Trackable progress
- [OK] Knowledge accumulation in spec docs

**Core Philosophy**: Read before write, follow standards, record promptly, capture learnings
