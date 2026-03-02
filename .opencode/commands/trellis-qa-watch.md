---
description: "Migrated command: /trellis-qa-watch"
---

# Compatibility alias for environments without nested slash-command names

读取 `.opencode/skills/qa-monitor/SKILL.md` 并按其流程启动 QA 持续监测循环：记录基线 HEAD → 构建 → 初始测试 → 轮询（10 分钟间隔检查新 commit，有变化则重建+完整回归，无变化则继续休眠）。
