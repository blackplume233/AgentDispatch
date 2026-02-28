import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Plus, Search, ListTodo, Kanban, TableProperties } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, PriorityBadge } from "@/components/common/status-badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { CreateTaskDialog } from "@/components/CreateTaskDialog";
import { useTasks } from "@/hooks/use-tasks";
import type { Task, TaskStatus } from "@/types";

const STATUS_FILTERS = ["all", "pending", "claimed", "in_progress", "completed", "failed", "cancelled"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];
type ViewMode = "kanban" | "table";

const KANBAN_COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "pending", label: "Pending" },
  { status: "claimed", label: "Claimed" },
  { status: "in_progress", label: "In Progress" },
  { status: "completed", label: "Completed" },
];

export function TasksPage() {
  const { t } = useTranslation();
  const { data: tasks, isLoading, error } = useTasks();
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [view, setView] = useState<ViewMode>("kanban");

  const counts = useMemo(() => {
    const list = tasks ?? [];
    const map: Record<string, number> = { all: list.length };
    for (const t of list) {
      map[t.status] = (map[t.status] ?? 0) + 1;
    }
    return map;
  }, [tasks]);

  const filtered = useMemo(() => {
    let result = tasks ?? [];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.toLowerCase().includes(q)),
      );
    }
    if (statusFilter !== "all") {
      result = result.filter((t) => t.status === statusFilter);
    }
    return result;
  }, [tasks, search, statusFilter]);

  const tasksByStatus = (status: TaskStatus): Task[] =>
    filtered.filter((t) => t.status === status);

  if (error) {
    return (
      <div className="flex items-center justify-center py-16 text-destructive">
        {t("common.error")}: {error.message}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t("tasks.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("tasks.subtitle")}</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t("tasks.newTask")}
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("tasks.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            {STATUS_FILTERS.map((f) => (
              <Badge
                key={f}
                variant={statusFilter === f ? "default" : "outline"}
                className="cursor-pointer select-none capitalize"
                onClick={() => setStatusFilter(f)}
              >
                {f === "all" ? t("common.all") : f.replace(/_/g, " ")}
                {counts[f] != null && (
                  <span className="ml-1 opacity-60">{counts[f]}</span>
                )}
              </Badge>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-lg border p-0.5">
            <Button
              variant={view === "kanban" ? "secondary" : "ghost"}
              size="icon"
              className="h-7 w-7"
              onClick={() => setView("kanban")}
            >
              <Kanban className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant={view === "table" ? "secondary" : "ghost"}
              size="icon"
              className="h-7 w-7"
              onClick={() => setView("table")}
            >
              <TableProperties className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="h-24 rounded-xl" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 && (tasks ?? []).length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <ListTodo className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium">{t("tasks.noTasks")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("tasks.noTasksHint")}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-3.5 w-3.5" />
            {t("tasks.newTask")}
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-8 text-center">
          <ListTodo className="mb-2 h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">{t("tasks.noMatch")}</p>
        </div>
      ) : view === "kanban" ? (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {KANBAN_COLUMNS.map((col) => (
              <KanbanColumn key={col.status} label={col.label} tasks={tasksByStatus(col.status)} />
            ))}
          </div>
          {/* Failed / Cancelled */}
          {(tasksByStatus("failed").length > 0 || tasksByStatus("cancelled").length > 0) && (
            <section>
              <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
                {t("tasks.failedCancelled")}
              </h3>
              <div className="space-y-2">
                {[...tasksByStatus("failed"), ...tasksByStatus("cancelled")].map((task) => (
                  <Link key={task.id} to={`/tasks/${task.id}`}>
                    <Card className="cursor-pointer transition-shadow hover:shadow-md">
                      <CardContent className="flex items-center gap-3 p-3">
                        <StatusBadge status={task.status} />
                        <span className="text-sm font-medium">{task.title}</span>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      ) : (
        <TaskTable tasks={filtered} />
      )}

      {showCreate && <CreateTaskDialog onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function KanbanColumn({ label, tasks }: { label: string; tasks: Task[] }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-xl bg-muted/50 p-3">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label} ({tasks.length})
      </h3>
      <div className="space-y-2">
        {tasks.map((task) => (
          <Link key={task.id} to={`/tasks/${task.id}`}>
            <Card className="cursor-pointer transition-shadow hover:shadow-md">
              <CardContent className="p-3">
                <h4 className="truncate text-sm font-semibold">{task.title}</h4>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <PriorityBadge priority={task.priority} />
                  {task.tags.slice(0, 2).map((tag) => (
                    <Badge key={tag} variant="secondary" className="font-normal text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
                {task.progress != null && (
                  <div className="mt-2">
                    <Progress value={task.progress} className="h-1.5" />
                  </div>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
        {tasks.length === 0 && (
          <p className="py-4 text-center text-xs text-muted-foreground/60">{t("common.noData")}</p>
        )}
      </div>
    </div>
  );
}

function TaskTable({ tasks }: { tasks: Task[] }) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Tags</TableHead>
            <TableHead>Progress</TableHead>
            <TableHead>Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map((task) => (
            <TableRow key={task.id} className="cursor-pointer">
              <TableCell>
                <Link to={`/tasks/${task.id}`} className="font-medium hover:underline">
                  {task.title}
                </Link>
              </TableCell>
              <TableCell><StatusBadge status={task.status} /></TableCell>
              <TableCell><PriorityBadge priority={task.priority} /></TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {task.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="font-normal text-xs">{tag}</Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell>
                {task.progress != null ? (
                  <div className="flex items-center gap-2">
                    <Progress value={task.progress} className="h-1.5 w-16" />
                    <span className="text-xs text-muted-foreground">{task.progress}%</span>
                  </div>
                ) : "—"}
              </TableCell>
              <TableCell className="text-muted-foreground text-xs">
                {new Date(task.updatedAt).toLocaleString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
