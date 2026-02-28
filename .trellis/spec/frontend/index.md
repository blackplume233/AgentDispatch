# Frontend Development Guidelines — AgentDispatch Dashboard

> Start here before any Dashboard frontend work.

---

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | React 18+ | SPA，Vite 构建 |
| UI Library | shadcn/ui | 基于 Radix UI + Tailwind CSS |
| Styling | Tailwind CSS | utility-first |
| State | TanStack Query (React Query) | 服务端状态管理 |
| Routing | React Router / TanStack Router | TBD |
| TypeScript | strict mode | 共享类型来自 `@shared` |
| Testing | Vitest + Testing Library | 组件测试 |

---

## Directory Structure

```
packages/dashboard/
├── index.html
├── vite.config.ts
├── tailwind.config.ts
├── src/
│   ├── main.tsx                    # 入口
│   ├── App.tsx                     # 根组件 + 路由
│   ├── components/                 # 通用组件
│   │   ├── ui/                     # shadcn/ui 组件（自动生成）
│   │   ├── layout/                 # 布局组件
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Header.tsx
│   │   │   └── Layout.tsx
│   │   └── common/                 # 项目通用组件
│   │       ├── StatusBadge.tsx
│   │       └── LoadingSpinner.tsx
│   ├── features/                   # 功能模块
│   │   ├── tasks/                  # 任务管理
│   │   │   ├── TaskBoard.tsx       # 看板视图
│   │   │   ├── TaskCard.tsx
│   │   │   ├── TaskDetail.tsx
│   │   │   ├── TaskCreateDialog.tsx
│   │   │   └── hooks/
│   │   │       └── useTasks.ts
│   │   └── clients/                # Client 管理
│   │       ├── ClientList.tsx
│   │       ├── ClientDetail.tsx
│   │       ├── AgentStatusCard.tsx
│   │       └── hooks/
│   │           └── useClients.ts
│   ├── api/                        # API 调用层
│   │   ├── client.ts               # HTTP client (fetch/axios)
│   │   ├── tasks.ts                # Task API
│   │   └── clients.ts              # Client API
│   ├── types/                      # 前端特有类型
│   │   └── index.ts
│   ├── lib/                        # 工具函数
│   │   └── utils.ts
│   └── styles/
│       └── globals.css
└── tests/
```

---

## Coding Standards

### 组件规范

- 使用函数组件 + Hooks，禁止 Class 组件
- 每个组件一个文件，文件名与组件名一致 (PascalCase)
- Props 使用 `interface` 定义，命名为 `{ComponentName}Props`
- 事件处理函数命名：`on{Event}` (props), `handle{Event}` (内部)

### 文件命名

| 类型 | 风格 | 示例 |
|------|------|------|
| 组件文件 | PascalCase | `TaskBoard.tsx` |
| Hook 文件 | camelCase | `useTasks.ts` |
| 工具文件 | camelCase | `formatDate.ts` |
| 类型文件 | camelCase | `index.ts` |

---

## Component Guidelines

### shadcn/ui 使用

- 通过 `npx shadcn-ui@latest add <component>` 添加组件
- 自动生成到 `src/components/ui/`，可按需修改
- 不要从 npm 直接安装 shadcn/ui

### 组件层级

```
页面组件 (Pages)
  └── 功能组件 (Features)
        └── 通用组件 (Common)
              └── UI 基础组件 (shadcn/ui)
```

### 状态管理策略

| 状态类型 | 方案 | 示例 |
|----------|------|------|
| 服务端状态 | TanStack Query | 任务列表、Client 状态 |
| UI 局部状态 | useState | 对话框开关、表单输入 |
| 全局 UI 状态 | Context / Zustand | 主题、侧边栏折叠 |

---

## Dashboard 页面规划

| 页面 | 路由 | 描述 |
|------|------|------|
| 任务看板 | `/tasks` | Kanban 视图，按状态分列 |
| 任务详情 | `/tasks/:id` | 任务信息、进度、日志 |
| Client 列表 | `/clients` | 所有注册 Client 及状态 |
| Client 详情 | `/clients/:id` | Agent 列表、负载、任务 |
| 创建任务 | `/tasks/new` | 任务创建表单 |

---

## Type Safety

### 类型来源

- 数据类型（Task, Client, Agent）从 `@shared/types` 导入
- API 响应类型在 `src/api/` 中定义
- 组件 Props 在组件文件内定义

### 禁止

- `any` 类型
- `@ts-ignore` / `@ts-expect-error`（除非有充分理由并加注释）
- 未类型化的 API 响应

---

## Data Fetching Pattern

```typescript
// api/tasks.ts
import { apiClient } from './client';
import type { Task, CreateTaskDTO } from '@shared/types';

export const taskApi = {
  list: (params?: TaskQueryParams) =>
    apiClient.get<Task[]>('/tasks', { params }),
  
  getById: (id: string) =>
    apiClient.get<Task>(`/tasks/${id}`),
  
  create: (dto: CreateTaskDTO) =>
    apiClient.post<Task>('/tasks', dto),
};

// features/tasks/hooks/useTasks.ts
import { useQuery } from '@tanstack/react-query';
import { taskApi } from '@/api/tasks';

export function useTasks(params?: TaskQueryParams) {
  return useQuery({
    queryKey: ['tasks', params],
    queryFn: () => taskApi.list(params),
    refetchInterval: 10_000,  // 与 Server 轮询间隔对齐
  });
}
```

---

## Testing

- 使用 Vitest + React Testing Library
- 组件测试关注用户交互，不测实现细节
- Mock API 层，不 mock hooks 内部
- 每个功能组件配套测试文件
