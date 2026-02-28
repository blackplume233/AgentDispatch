# AgentDispatch Documentation

> 项目文档根目录。所有非 spec 的文档（规划、验收标准、技术框架、设计决策等）统一存放于此。

## 目录说明

```
doc/
├── README.md                         # 本文件 — 文档索引
├── baseline-roadmap.md               # 基线 Roadmap（里程碑 & 交付计划）
├── baseline-acceptance-spec.md       # 验收规范（门禁 & 测试矩阵）
└── baseline-technical-framework.md   # 技术框架（架构 & 选型 & 约束）
```

## 文档分类

| 分类 | 位置 | 用途 |
|------|------|------|
| **Spec（实现规范）** | `.trellis/spec/` | 接口契约、配置规范、编码规范 — 代码实现的 source of truth |
| **Doc（项目文档）** | `doc/` | 规划、验收、技术框架、设计决策、会议记录等 |

## 约定

- 新增文档请放置在 `doc/` 目录下
- 文件名使用 `kebab-case`
- 每次新增文档后更新本索引
