# Frontend Development Guidelines — AgentDispatch Dashboard

> Start here before any Dashboard frontend work.

---

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | React 19 | SPA, Vite 6 构建 |
| UI Library | shadcn/ui (new-york) | 基于 Radix UI + Tailwind CSS |
| Styling | Tailwind CSS v4 | utility-first, oklch design tokens |
| State | TanStack Query (React Query 5) | 服务端状态管理 |
| Routing | React Router v7 | |
| Icons | Lucide React | |
| i18n | react-i18next | en + zh-CN |
| TypeScript | strict mode | 共享类型来自 `@/types` |
| Testing | Vitest + Playwright | 组件 + E2E 测试 |

---

## Directory Structure

```
packages/dashboard/
├── index.html
├── vite.config.ts              # Vite + Tailwind + @ alias
├── tsconfig.json               # paths: @/* -> src/*
├── src/
│   ├── main.tsx                # 入口
│   ├── App.tsx                 # 根组件 + 路由
│   ├── styles.css              # Tailwind + oklch theme tokens
│   ├── types.ts                # 数据类型
│   ├── api/
│   │   └── client.ts           # REST API client
│   ├── hooks/
│   │   ├── use-tasks.ts        # Task 数据 hooks
│   │   ├── use-clients.ts      # Client 数据 hooks
│   │   └── use-theme.ts        # 暗色/亮色主题切换
│   ├── i18n/
│   │   ├── index.ts            # i18next 初始化
│   │   ├── en.ts               # 英文翻译
│   │   └── zh-CN.ts            # 中文翻译
│   ├── lib/
│   │   └── utils.ts            # cn() 工具函数
│   ├── components/
│   │   ├── ui/                 # shadcn/ui 基础组件
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── input.tsx
│   │   │   ├── textarea.tsx
│   │   │   ├── table.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── dropdown-menu.tsx
│   │   │   ├── select.tsx
│   │   │   ├── label.tsx
│   │   │   ├── tabs.tsx
│   │   │   ├── separator.tsx
│   │   │   ├── skeleton.tsx
│   │   │   └── progress.tsx
│   │   ├── layout/
│   │   │   ├── shell.tsx       # App Shell (Sidebar + TopBar + Main)
│   │   │   ├── app-sidebar.tsx # 导航侧边栏
│   │   │   └── top-bar.tsx     # 顶部栏
│   │   ├── common/
│   │   │   └── status-badge.tsx # 状态/优先级 Badge
│   │   └── CreateTaskDialog.tsx # 创建任务对话框
│   └── pages/
│       ├── CommandCenter.tsx    # 首页 — 统计卡片 + 近期任务
│       ├── TasksPage.tsx       # 任务看板/表格 + 筛选
│       ├── TaskDetailPage.tsx  # 任务详情
│       ├── ClientsPage.tsx     # 客户端列表
│       ├── ClientDetailPage.tsx # 客户端详情 + Agent 表
│       ├── EventsPage.tsx      # 事件流
│       ├── SettingsPage.tsx    # 系统设置
│       └── NotFoundPage.tsx    # 404 页面
└── tests/
```

---

## Pages & Routes

| 路由 | 页面组件 | 描述 |
|------|---------|------|
| `/` | CommandCenter | 仪表盘首页 (统计卡片 + 最近任务 + 客户端概览) |
| `/tasks` | TasksPage | 看板/表格视图, Badge 状态筛选, 搜索 |
| `/tasks/:id` | TaskDetailPage | 任务详情 (Info Card + 描述 + 产物 + 元数据) |
| `/clients` | ClientsPage | 客户端表格, 搜索 |
| `/clients/:id` | ClientDetailPage | 客户端详情 + Agent 列表 |
| `/events` | EventsPage | 事件时间线, 分类筛选 |
| `/settings` | SettingsPage | 连接状态, 主题切换, 任务/客户端概览 |
| `*` | NotFoundPage | 404 |

---

## Layout Architecture

```
Shell
├── AppSidebar          # 固定 w-56 侧边栏, 导航链接, 语言切换
├── TopBar              # h-14 顶部栏, 品牌名, 暗色模式切换, 连接状态
└── Main                # flex-1 overflow-y-auto p-6, 页面内容
```

**Provider 嵌套顺序:**
```
QueryClientProvider → BrowserRouter → Shell → Routes
```

---

## Design Tokens

使用 oklch 色彩空间 CSS 变量，支持亮色/暗色模式:
- `--background`, `--foreground`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`
- `--card`, `--popover`, `--border`, `--input`, `--ring`
- `--sidebar-*` (侧边栏专属)
- `--chart-1` ~ `--chart-5`
- `--radius` (圆角基础值)

暗色模式通过 `.dark` class 在 `<html>` 上切换。

---

## Coding Standards

### 组件规范
- 函数组件 + Hooks，禁止 Class 组件
- 路径别名 `@/` 引用 (`@/components/ui/button`)
- 使用 `cn()` 工具合并 Tailwind class
- CVA (class-variance-authority) 定义组件变体

### 文件命名
| 类型 | 风格 | 示例 |
|------|------|------|
| 页面组件 | PascalCase | `TasksPage.tsx` |
| 布局组件 | kebab-case | `app-sidebar.tsx` |
| Hook 文件 | kebab-case | `use-tasks.ts` |
| UI 组件 | kebab-case | `button.tsx` |

### 状态管理
| 状态类型 | 方案 |
|----------|------|
| 服务端状态 | TanStack Query |
| UI 局部状态 | useState |
| 主题 | useTheme hook + localStorage |
| i18n | react-i18next |

---

## Testing

- Vitest — 单元 + 组件测试
- Playwright — E2E 测试
- 关注用户交互，不测实现细节
- Mock API 层
