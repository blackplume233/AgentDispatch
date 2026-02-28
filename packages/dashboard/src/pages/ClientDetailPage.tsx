import type React from "react";
import { useTranslation } from "react-i18next";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Monitor, Clock, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/common/status-badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { useClient } from "@/hooks/use-clients";
import { useClientLogs } from "@/hooks/use-client-logs";

export function ClientDetailPage(): React.ReactElement {
  const { t } = useTranslation();
  const { id = "" } = useParams<{ id: string }>();
  const { data: client, isLoading, error } = useClient(id);
  const isOnline = client?.status === "online";
  const { logs } = useClientLogs(id, isOnline);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[200px] rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-16 text-destructive">
        {t("common.error")}: {error.message}
      </div>
    );
  }

  if (!client) {
    return (
      <div className="flex flex-col items-center py-16 text-center">
        <p className="text-sm text-muted-foreground">Client not found</p>
        <Link to="/clients" className="mt-4">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-2 h-3.5 w-3.5" />
            {t("clients.detail.backToClients")}
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link to="/clients" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("clients.detail.backToClients")}
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
            <Monitor className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{client.name}</h2>
            <StatusBadge status={client.status} />
          </div>
        </div>
      </div>

      {/* Info card */}
      <Card>
        <CardContent className="p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <InfoRow label="ID">
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">{client.id}</code>
            </InfoRow>
            <InfoRow label={t("clients.host")}>
              <span className="text-sm">{client.host}</span>
            </InfoRow>
            <InfoRow label={t("clients.dispatchMode")}>
              <Badge variant="secondary" className="font-normal capitalize">{client.dispatchMode}</Badge>
            </InfoRow>
            <InfoRow label="Tags">
              <div className="flex flex-wrap gap-1">
                {client.tags.length > 0 ? client.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="font-normal text-xs">{tag}</Badge>
                )) : <span className="text-xs text-muted-foreground">—</span>}
              </div>
            </InfoRow>
            <Separator className="col-span-full" />
            <InfoRow label={t("clients.detail.registered")}>
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm">{new Date(client.registeredAt).toLocaleString()}</span>
              </div>
            </InfoRow>
            <InfoRow label={t("clients.lastHeartbeat")}>
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm">{new Date(client.lastHeartbeat).toLocaleString()}</span>
              </div>
            </InfoRow>
          </div>
        </CardContent>
      </Card>

      {/* Agents */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("clients.agents")} ({client.agents.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {client.agents.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("clients.detail.noAgents")}</p>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("clients.detail.agentId")}</TableHead>
                    <TableHead>{t("clients.detail.agentType")}</TableHead>
                    <TableHead>{t("clients.detail.agentStatus")}</TableHead>
                    <TableHead>{t("clients.detail.currentTask")}</TableHead>
                    <TableHead>{t("clients.detail.capabilities")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {client.agents.map((agent) => (
                    <TableRow key={agent.id}>
                      <TableCell>
                        <code className="text-xs font-mono">{agent.id}</code>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">{agent.type}</Badge>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={agent.status} />
                      </TableCell>
                      <TableCell>
                        {agent.currentTaskId ? (
                          <Link to={`/tasks/${agent.currentTaskId}`} className="text-sm hover:underline">
                            {agent.currentTaskId.slice(0, 8)}...
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {agent.capabilities.map((c) => (
                            <Badge key={c} variant="secondary" className="font-normal text-xs">{c}</Badge>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Operation Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ScrollText className="h-4 w-4" />
            {t("clients.detail.operationLogs")}
            {isOnline && (
              <span className="ml-2 h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("clients.detail.noLogs")}</p>
          ) : (
            <div className="rounded-lg border overflow-auto max-h-96">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">{t("clients.detail.logTime")}</TableHead>
                    <TableHead className="w-[60px]">{t("clients.detail.logLevel")}</TableHead>
                    <TableHead className="w-[140px]">{t("clients.detail.logEvent")}</TableHead>
                    <TableHead>{t("clients.detail.logMessage")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={log.level === "error" ? "destructive" : log.level === "warn" ? "secondary" : "outline"}
                          className="text-[10px] py-0"
                        >
                          {log.level}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <code className="text-xs">{log.event}</code>
                      </TableCell>
                      <TableCell className="text-xs max-w-[300px] truncate">
                        {log.message}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
      <div>{children}</div>
    </div>
  );
}
