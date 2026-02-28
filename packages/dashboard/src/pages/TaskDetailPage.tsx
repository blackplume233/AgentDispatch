import { useTranslation } from "react-i18next";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, FileArchive, FileJson, Clock, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { StatusBadge, PriorityBadge } from "@/components/common/status-badge";
import { useTask } from "@/hooks/use-tasks";

export function TaskDetailPage() {
  const { t } = useTranslation();
  const { id = "" } = useParams<{ id: string }>();
  const { data: task, isLoading, error } = useTask(id);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[200px] rounded-xl" />
        <Skeleton className="h-[120px] rounded-xl" />
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

  if (!task) {
    return (
      <div className="flex flex-col items-center py-16 text-center">
        <p className="text-sm text-muted-foreground">{t("common.noData")}</p>
        <Link to="/tasks" className="mt-4">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-2 h-3.5 w-3.5" />
            {t("tasks.detail.backToTasks")}
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/tasks" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" />
            {t("tasks.detail.backToTasks")}
          </Link>
          <h2 className="text-2xl font-bold tracking-tight">{task.title}</h2>
        </div>
      </div>

      {/* Main info card */}
      <Card>
        <CardContent className="p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <InfoRow label="ID">
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">{task.id}</code>
            </InfoRow>
            <InfoRow label="Status">
              <StatusBadge status={task.status} />
            </InfoRow>
            <InfoRow label="Priority">
              <PriorityBadge priority={task.priority} />
            </InfoRow>
            <InfoRow label="Tags">
              <div className="flex flex-wrap gap-1">
                {task.tags.length > 0 ? task.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="font-normal text-xs">{tag}</Badge>
                )) : <span className="text-muted-foreground text-xs">—</span>}
              </div>
            </InfoRow>

            {task.progress != null && (
              <InfoRow label={t("tasks.detail.progress")} fullWidth>
                <div className="flex items-center gap-3">
                  <Progress value={task.progress} className="h-2 flex-1" />
                  <span className="text-sm font-medium">{task.progress}%</span>
                </div>
                {task.progressMessage && (
                  <p className="mt-1 text-xs text-muted-foreground">{task.progressMessage}</p>
                )}
              </InfoRow>
            )}

            {task.claimedBy && (
              <InfoRow label={t("tasks.detail.claimedBy")} fullWidth>
                <div className="flex items-center gap-2">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm">Client: {task.claimedBy.clientId} / Agent: {task.claimedBy.agentId}</span>
                </div>
              </InfoRow>
            )}

            <Separator className="col-span-full" />

            <InfoRow label="Created">
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm">{new Date(task.createdAt).toLocaleString()}</span>
              </div>
            </InfoRow>
            <InfoRow label="Updated">
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm">{new Date(task.updatedAt).toLocaleString()}</span>
              </div>
            </InfoRow>
            {task.completedAt && (
              <InfoRow label="Completed">
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm">{new Date(task.completedAt).toLocaleString()}</span>
                </div>
              </InfoRow>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Description */}
      {task.description && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("tasks.detail.description")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="whitespace-pre-wrap text-sm">{task.description}</div>
          </CardContent>
        </Card>
      )}

      {/* Artifacts */}
      {task.artifacts && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileArchive className="h-4 w-4" />
              {t("tasks.detail.artifacts")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow label={t("tasks.detail.zipFile")}>
              <span className="text-sm font-mono">{task.artifacts.zipFile}</span>
            </InfoRow>
            <Separator />
            <InfoRow label={t("tasks.detail.size")}>
              <span className="text-sm">{(task.artifacts.zipSizeBytes / 1024).toFixed(1)} KB</span>
            </InfoRow>
            <Separator />
            <InfoRow label={t("tasks.detail.hash")}>
              <code className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono">{task.artifacts.zipHash}</code>
            </InfoRow>
            <Separator />
            <InfoRow label={t("tasks.detail.summary")}>
              <span className="text-sm">{task.artifacts.resultJson.summary}</span>
            </InfoRow>
            <Separator />
            <InfoRow label={t("tasks.detail.success")}>
              <Badge variant={task.artifacts.resultJson.success ? "default" : "destructive"}>
                {task.artifacts.resultJson.success ? t("tasks.detail.yes") : t("tasks.detail.no")}
              </Badge>
            </InfoRow>
          </CardContent>
        </Card>
      )}

      {/* Metadata */}
      {task.metadata && Object.keys(task.metadata).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileJson className="h-4 w-4" />
              {t("tasks.detail.metadata")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="rounded-lg bg-muted p-4 text-xs font-mono overflow-auto">
              {JSON.stringify(task.metadata, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function InfoRow({
  label,
  children,
  fullWidth,
}: {
  label: string;
  children: React.ReactNode;
  fullWidth?: boolean;
}) {
  return (
    <div className={fullWidth ? "col-span-full" : ""}>
      <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
      <div>{children}</div>
    </div>
  );
}
