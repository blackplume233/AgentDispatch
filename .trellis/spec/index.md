# Specification Overview

> Documentation-first: spec > implementation. When spec and code disagree, spec wins.

## Structure

```
spec/
|-- index.md              # This file
|-- config-spec.md        # Configuration specification
|-- api-contracts.md      # Interface contracts (API, CLI, errors)
|-- frontend/
|   \-- index.md          # Frontend guidelines index
|-- backend/
|   \-- index.md          # Backend guidelines index
\-- guides/
    |-- index.md          # Guides index
    |-- cross-layer-thinking-guide.md
    \-- code-reuse-thinking-guide.md
```

## Principles

1. **Spec is the source of truth** — When implementation diverges from spec, fix the implementation (or update spec with rationale)
2. **Update spec first** — Before changing APIs, config, or interfaces, update the spec document
3. **Keep it current** — After every feature/fix that changes behavior, sync the spec

## How to Use

- Before coding: read the relevant spec docs
- After coding: verify your changes match the spec; update if needed
- During review: check spec compliance
