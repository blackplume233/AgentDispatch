import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Settings, Server, Monitor, Sun, Moon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";
import { useTasks } from "@/hooks/use-tasks";
import { useClients } from "@/hooks/use-clients";

export function SettingsPage() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const { data: tasks } = useTasks();
  const { data: clients } = useClients();

  const taskStats = useMemo(() => {
    const list = tasks ?? [];
    const map: Record<string, number> = {};
    for (const task of list) {
      map[task.status] = (map[task.status] ?? 0) + 1;
    }
    return map;
  }, [tasks]);

  const clientStats = useMemo(() => {
    const list = clients ?? [];
    const map: Record<string, number> = {};
    for (const client of list) {
      map[client.status] = (map[client.status] ?? 0) + 1;
    }
    return map;
  }, [clients]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{t("settings.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("settings.subtitle")}</p>
      </div>

      {/* Connection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Server className="h-4 w-4" />
            {t("settings.connectionTitle")}
          </CardTitle>
          <CardDescription>{t("settings.connectionDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <div className="h-3 w-3 rounded-full bg-emerald-500 shadow-sm shadow-emerald-200" />
            <span className="text-sm font-medium">{t("common.connected")}</span>
          </div>
        </CardContent>
      </Card>

      {/* Theme */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sun className="h-4 w-4" />
            {t("settings.theme")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Button
              variant={theme === "light" ? "default" : "outline"}
              size="sm"
              onClick={() => setTheme("light")}
            >
              <Sun className="mr-2 h-3.5 w-3.5" />
              {t("settings.themeLight")}
            </Button>
            <Button
              variant={theme === "dark" ? "default" : "outline"}
              size="sm"
              onClick={() => setTheme("dark")}
            >
              <Moon className="mr-2 h-3.5 w-3.5" />
              {t("settings.themeDark")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Task overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings className="h-4 w-4" />
            {t("settings.taskOverview")}
          </CardTitle>
          <CardDescription>{t("settings.taskOverviewDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {Object.keys(taskStats).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("tasks.noTasks")}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {Object.entries(taskStats).map(([status, count]) => (
                <Badge key={status} variant="outline" className="capitalize">
                  {status.replace(/_/g, " ")}: {count}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Client overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Monitor className="h-4 w-4" />
            {t("settings.clientOverview")}
          </CardTitle>
          <CardDescription>{t("settings.clientOverviewDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {Object.keys(clientStats).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("clients.noClients")}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {Object.entries(clientStats).map(([status, count]) => (
                <Badge key={status} variant="outline" className="capitalize">
                  {status}: {count}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings.aboutTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>{t("settings.aboutDesc")}</p>
          <p className="text-xs">v0.0.1</p>
        </CardContent>
      </Card>
    </div>
  );
}
