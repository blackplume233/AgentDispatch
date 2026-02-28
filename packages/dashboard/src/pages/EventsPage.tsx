import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Radio, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { useTasks } from "@/hooks/use-tasks";
import { useClients } from "@/hooks/use-clients";

interface EventEntry {
  id: string;
  time: string;
  event: string;
  source: string;
  details: string;
  category: string;
}

export function EventsPage() {
  const { t } = useTranslation();
  const { data: tasks } = useTasks();
  const { data: clients } = useClients();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const events = useMemo<EventEntry[]>(() => {
    const entries: EventEntry[] = [];

    for (const task of tasks ?? []) {
      entries.push({
        id: `task-created-${task.id}`,
        time: task.createdAt,
        event: "task:created",
        source: "system",
        details: task.title,
        category: "task",
      });
      if (task.claimedAt) {
        entries.push({
          id: `task-claimed-${task.id}`,
          time: task.claimedAt,
          event: "task:claimed",
          source: task.claimedBy ? `${task.claimedBy.clientId}/${task.claimedBy.agentId}` : "unknown",
          details: task.title,
          category: "task",
        });
      }
      if (task.completedAt) {
        entries.push({
          id: `task-completed-${task.id}`,
          time: task.completedAt,
          event: task.status === "completed" ? "task:completed" : `task:${task.status}`,
          source: task.claimedBy ? `${task.claimedBy.clientId}/${task.claimedBy.agentId}` : "system",
          details: task.title,
          category: "task",
        });
      }
    }

    for (const client of clients ?? []) {
      entries.push({
        id: `client-registered-${client.id}`,
        time: client.registeredAt,
        event: "client:registered",
        source: client.name,
        details: `${client.agents.length} agents, ${client.dispatchMode}`,
        category: "client",
      });
      entries.push({
        id: `client-heartbeat-${client.id}`,
        time: client.lastHeartbeat,
        event: "client:heartbeat",
        source: client.name,
        details: client.status,
        category: "client",
      });
    }

    entries.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
    return entries;
  }, [tasks, clients]);

  const categories = useMemo(() => {
    const cats = new Set(events.map((e) => e.category));
    return ["all", ...Array.from(cats)];
  }, [events]);

  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = { all: events.length };
    for (const e of events) {
      map[e.category] = (map[e.category] ?? 0) + 1;
    }
    return map;
  }, [events]);

  const filtered = useMemo(() => {
    let result = events;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (e) =>
          e.event.toLowerCase().includes(q) ||
          e.source.toLowerCase().includes(q) ||
          e.details.toLowerCase().includes(q),
      );
    }
    if (categoryFilter !== "all") {
      result = result.filter((e) => e.category === categoryFilter);
    }
    return result;
  }, [events, search, categoryFilter]);

  const EVENT_COLORS: Record<string, string> = {
    "task:created": "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300",
    "task:claimed": "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300",
    "task:completed": "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300",
    "task:failed": "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300",
    "task:cancelled": "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-400",
    "client:registered": "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950 dark:text-teal-300",
    "client:heartbeat": "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-400",
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{t("events.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("events.subtitle")}</p>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("events.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {categories.map((cat) => (
            <Badge
              key={cat}
              variant={categoryFilter === cat ? "default" : "outline"}
              className="cursor-pointer select-none capitalize"
              onClick={() => setCategoryFilter(cat)}
            >
              {cat}
              {categoryCounts[cat] != null && (
                <span className="ml-1 opacity-60">{categoryCounts[cat]}</span>
              )}
            </Badge>
          ))}
        </div>
      </div>

      {events.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <Radio className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium">{t("events.noEvents")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("events.noEventsHint")}</p>
        </div>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {t("events.eventLog")} <span className="text-muted-foreground font-normal">({filtered.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("events.time")}</TableHead>
                  <TableHead>{t("events.event")}</TableHead>
                  <TableHead>{t("events.source")}</TableHead>
                  <TableHead>{t("events.details")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 100).map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(entry.time).toLocaleTimeString()}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${EVENT_COLORS[entry.event] ?? "bg-muted text-muted-foreground"}`}>
                        {entry.event}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{entry.source}</TableCell>
                    <TableCell className="max-w-xs truncate text-sm">{entry.details}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
