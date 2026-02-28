import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ListTodo, Play, Clock, CheckCircle, Monitor } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, PriorityBadge } from "@/components/common/status-badge";
import { useTasks } from "@/hooks/use-tasks";
import { useClients } from "@/hooks/use-clients";

export function CommandCenter() {
  const { t } = useTranslation();
  const { data: tasks, isLoading: tasksLoading } = useTasks();
  const { data: clients, isLoading: clientsLoading } = useClients();

  const stats = useMemo(() => {
    const list = tasks ?? [];
    return {
      total: list.length,
      pending: list.filter((t) => t.status === "pending").length,
      inProgress: list.filter((t) => t.status === "in_progress" || t.status === "claimed").length,
      completed: list.filter((t) => t.status === "completed").length,
    };
  }, [tasks]);

  const activeClients = useMemo(() => {
    return (clients ?? []).filter((c) => c.status === "online").length;
  }, [clients]);

  const recentTasks = useMemo(() => {
    return (tasks ?? [])
      .slice()
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 8);
  }, [tasks]);

  const loading = tasksLoading || clientsLoading;

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{t("dashboard.title")}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t("dashboard.subtitle")}</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[88px] rounded-xl" />
          ))
        ) : (
          <>
            <StatCard
              label={t("dashboard.totalTasks")}
              value={stats.total}
              icon={<ListTodo className="h-4 w-4 text-muted-foreground" />}
            />
            <StatCard
              label={t("dashboard.pending")}
              value={stats.pending}
              icon={<Clock className="h-4 w-4 text-amber-500" />}
              accent={stats.pending > 0 ? "text-amber-600" : undefined}
            />
            <StatCard
              label={t("dashboard.inProgress")}
              value={stats.inProgress}
              icon={<Play className="h-4 w-4 text-blue-500" />}
              accent={stats.inProgress > 0 ? "text-blue-600" : undefined}
            />
            <StatCard
              label={t("dashboard.completed")}
              value={stats.completed}
              icon={<CheckCircle className="h-4 w-4 text-emerald-500" />}
              accent={stats.completed > 0 ? "text-emerald-600" : undefined}
            />
            <StatCard
              label={t("dashboard.activeClients")}
              value={activeClients}
              icon={<Monitor className="h-4 w-4 text-violet-500" />}
              accent={activeClients > 0 ? "text-violet-600" : undefined}
            />
          </>
        )}
      </div>

      {/* Recent tasks */}
      <section>
        <h3 className="mb-4 text-lg font-semibold">{t("dashboard.recentTasks")}</h3>
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[100px] rounded-xl" />
            ))}
          </div>
        ) : recentTasks.length === 0 ? (
          <EmptyBlock icon={<ListTodo className="h-10 w-10 text-muted-foreground/40" />} text={t("tasks.noTasks")} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {recentTasks.map((task) => (
              <Link key={task.id} to={`/tasks/${task.id}`}>
                <Card className="group cursor-pointer transition-shadow hover:shadow-md">
                  <CardContent className="p-4">
                    <h4 className="truncate text-sm font-semibold">{task.title}</h4>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <StatusBadge status={task.status} />
                      <PriorityBadge priority={task.priority} />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {new Date(task.updatedAt).toLocaleString()}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Client overview */}
      <section>
        <h3 className="mb-4 text-lg font-semibold">{t("dashboard.clientOverview")}</h3>
        {clientsLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-[100px] rounded-xl" />
            ))}
          </div>
        ) : (clients ?? []).length === 0 ? (
          <EmptyBlock icon={<Monitor className="h-10 w-10 text-muted-foreground/40" />} text={t("clients.noClients")} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(clients ?? []).map((client) => (
              <Link key={client.id} to={`/clients/${client.id}`}>
                <Card className="group cursor-pointer transition-shadow hover:shadow-md">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                        <Monitor className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="truncate text-sm font-semibold">{client.name}</h4>
                        <StatusBadge status={client.status} />
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{client.agents.length} agents</span>
                      <span>{client.dispatchMode}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  accent?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
          {icon}
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className={`text-2xl font-bold ${accent ?? ""}`}>{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyBlock({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-12 text-center">
      {icon}
      <p className="mt-3 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
