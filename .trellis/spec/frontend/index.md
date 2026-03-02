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
│   │   ├── use-worker-tags.ts  # 从 clients 提取有效 worker tags
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
│   │   │   ├── popover.tsx
│   │   │   ├── multi-select.tsx
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

## API Proxy & Remote Access [NEW 2026-03-02]

Dashboard 通过 Vite dev server 代理 API 请求到 Server。代理行为由环境变量控制，详见 `config-spec.md` §5 Dashboard Configuration。

| 代理路径 | 目标 | 说明 |
|---------|------|------|
| `/api/*` | `{VITE_API_URL}/api/*` | Server REST API |
| `/health` | `{VITE_API_URL}/health` | 健康检查（auth 流程依赖） |

> **Gotcha**: `VITE_API_URL` 默认为 `http://localhost:9800`。当用户从其他设备访问 Dashboard 时，浏览器将 `localhost` 解析为设备自身的 loopback 地址，导致 API 请求失败。表现为 auth 状态反复切换（login 页面闪烁）或 "Unable to connect to server"。
>
> 部署到非 localhost 环境时**必须**设置 `VITE_API_URL` 指向 Server 的网络地址。详见 [故障排查指南](../../../docs/guide/troubleshooting.md)。

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

## Common Patterns [NEW 2026-02-28]

### 进度展示：状态文本 + 脉冲指示器

> **不要使用进度条或百分比数字。** AI Agent 的任务完成时间不可预测，百分比会误导用户。

使用 Tailwind 动画脉冲绿点 + Agent 当前状态描述文字：

```tsx
{task.progressMessage && (
  <div className="flex items-center gap-2">
    {isActive && (
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
      </span>
    )}
    <span className="text-sm">{task.progressMessage}</span>
  </div>
)}
```

### 日志流合并渲染 [NEW 2026-03-01]

> **Problem**: 即使后端做了流式聚合，日志条目仍可能因 flush 定时器等原因产生相邻同类型条目。逐条渲染会导致视觉碎片化。

**Pattern**: 在渲染前用 `mergeLogs()` 合并相邻同类型日志条目：

```typescript
const STREAM_TYPES = new Set(["text", "thinking", "prompt"]);
const TOOL_TYPES = new Set(["tool_call", "tool_call_update"]);

function isMergeable(a: LogEntry, b: LogEntry): boolean {
  if (a.metadata?.sessionId !== b.metadata?.sessionId) return false;
  if (a.type === b.type && STREAM_TYPES.has(a.type)) return true;
  if (TOOL_TYPES.has(a.type) && TOOL_TYPES.has(b.type)) return true;
  return false;
}

function mergeLogs(entries: LogEntry[]): LogEntry[] {
  const merged: LogEntry[] = [];
  let current = entries[0];
  for (let i = 1; i < entries.length; i++) {
    if (isMergeable(current, entries[i])) {
      const sep = TOOL_TYPES.has(current.type) ? "\n" : "";
      current = { ...current, content: current.content + sep + entries[i].content };
    } else {
      merged.push(current);
      current = entries[i];
    }
  }
  merged.push(current);
  return merged;
}
```

**合并规则**：
- 同 sessionId + 同类型的 text/thinking/prompt → 直接拼接 content
- 同 sessionId 的连续 tool_call + tool_call_update → 换行拼接（每个 tool 调用保持可辨识）
- 不同 sessionId 或不同类别 → 不合并，保留边界

### Markdown 渲染日志和产物

AI 日志（text、thinking、plan）及 `.md` 产物文件使用 `react-markdown` + `remark-gfm` 渲染：

```tsx
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

<div className="prose prose-sm dark:prose-invert max-w-none">
  <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
</div>
```

**注意**：`prose` 样式中 `dark:prose-invert` 确保暗色模式下文字可读。设置 `max-w-none` 避免内容被截断。

### 显式函数返回类型

ESLint `explicit-function-return-type` 规则要求所有导出函数（包括 React 组件）声明返回类型：

```tsx
// ✅ 正确
export function TasksPage(): React.ReactElement { ... }
export function useTheme(): { theme: string; toggle: () => void } { ... }

// ❌ 错误 — 缺少返回类型
export function TasksPage() { ... }
```

Hook 返回复杂对象时，定义 interface 后作为返回类型。

---

## Testing

- Vitest — 单元 + 组件测试
- Playwright — E2E 测试
- 关注用户交互，不测实现细节
- Mock API 层
