# Conflict Patterns for Spec Optimization

Use this reference when reviewing `.trellis/spec` and adjacent docs.

## P0: Contract Conflicts

### 1) State machine vs type definition

- Check whether diagrams include states missing from canonical type unions.
- Example class: diagram shows `created`, type omits `created`.
- Fix pattern: remove orphan state or add it across all transition tables and DTO docs.

### 2) Cross-file semantic contradiction

- Compare lifecycle semantics across `api-contracts.md`, `backend/index.md`, and `config-spec.md`.
- Example class: ACP session `cwd` says isolated task dir in one file, agent `workDir` in another.
- Fix pattern: select one source of truth, then update all narrative + examples.

## P1: Incomplete Matrices / Missing Fields

### 3) Schema text promises field, interface omits it

- Check declared additions (for example, `token?: string`) against interface snippets.
- Fix pattern: patch interface and all related command examples.

### 4) Command restrictions vs command catalog mismatch

- Compare restricted/allowed command lists against the full command matrix.
- Fix pattern: expand matrix entries with payload/response for every referenced command.

### 5) Broken links in guides

- Validate relative links to guide files and backend references.
- Fix pattern: point to existing docs or create missing target explicitly.

## P2: Scope and Narrative Drift

### 6) Legacy project terminology contamination

- Detect references to other projects, old architecture names, or obsolete paths.
- Fix pattern: rewrite in current project language and keep only reusable principles.

### 7) Module-count mismatch across summaries

- Compare high-level module descriptions across overview and README-like docs.
- Fix pattern: choose one phrasing and propagate consistently.

## Decision Prompt Template

Use this template for user confirmation:

```
Conflict: <short title>
Evidence: <path:line>, <path:line>

Options:
A) <option A>
B) <option B>
[C) <option C>]

Recommendation: <best option + reason>

Please reply with A/B[/C].
```
