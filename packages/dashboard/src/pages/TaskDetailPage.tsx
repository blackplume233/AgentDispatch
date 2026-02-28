import type React from "react";
import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useParams, Link } from "react-router-dom";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowLeft, FileArchive, FileJson, Clock, User, Download,
  Eye, AlertCircle, Brain, MessageSquare, Wrench, Shield,
  FileText, Terminal, ListChecks, Info, ChevronDown, ChevronRight,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";


import { StatusBadge, PriorityBadge } from "@/components/common/status-badge";
import { useTask } from "@/hooks/use-tasks";
import { useTaskLogs } from "@/hooks/use-task-logs";
import { useArtifactFiles } from "@/hooks/use-artifact-files";
import { api } from "@/api/client";
import type { InteractionLogEntry, InteractionStepType, ArtifactFileEntry } from "@/types";

export function TaskDetailPage(): React.ReactElement {
  const { t } = useTranslation();
  const { id = "" } = useParams<{ id: string }>();
  const { data: task, isLoading, error, refetch } = useTask(id);

  const isActive = !!task && !["completed", "failed", "cancelled"].includes(task.status);
  const { logs } = useTaskLogs(id, isActive);
  const hasArtifacts = !!task?.artifacts;
  const { data: artifactFiles } = useArtifactFiles(id, hasArtifacts);

  const [cancelling, setCancelling] = useState(false);
  const handleCancel = useCallback(async (): Promise<void> => {
    if (!confirm(t("tasks.detail.cancelConfirm"))) return;
    setCancelling(true);
    try {
      await api.tasks.cancel(id);
      await refetch();
    } catch { /* ignore */ } finally {
      setCancelling(false);
    }
  }, [id, t, refetch]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
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
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/tasks" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" />
            {t("tasks.detail.backToTasks")}
          </Link>
          <h2 className="text-2xl font-bold tracking-tight">{task.title}</h2>
        </div>
        {isActive && (
          <Button
            variant="destructive"
            size="sm"
            onClick={handleCancel}
            disabled={cancelling}
          >
            <XCircle className="mr-1.5 h-3.5 w-3.5" />
            {cancelling ? t("tasks.detail.cancelling") : t("tasks.detail.cancelTask")}
          </Button>
        )}
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

            {task.progressMessage && (
              <InfoRow label={t("tasks.detail.progress")} fullWidth>
                <div className="flex items-center gap-2">
                  {isActive && (
                    <span className="relative flex h-2.5 w-2.5 shrink-0">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    </span>
                  )}
                  <span className="text-sm">{task.progressMessage}</span>
                </div>
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

      {/* Result Summary */}
      {task.artifacts && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileJson className="h-4 w-4" />
              {t("tasks.detail.resultSummary")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Badge variant={task.artifacts.resultJson.success ? "default" : "destructive"} className="text-sm">
                {task.artifacts.resultJson.success ? t("tasks.detail.yes") : t("tasks.detail.no")}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {(task.artifacts.zipSizeBytes / 1024).toFixed(1)} KB
              </span>
              <a href={api.artifacts.downloadZipUrl(task.id)} download>
                <Button variant="outline" size="sm">
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  {t("tasks.detail.downloadZip")}
                </Button>
              </a>
            </div>
            <p className="text-sm">{task.artifacts.resultJson.summary}</p>

            {task.artifacts.resultJson.errors && task.artifacts.resultJson.errors.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-destructive">{t("tasks.detail.errors")}</p>
                {task.artifacts.resultJson.errors.map((err, i) => (
                  <div key={i} className="flex items-start gap-2 rounded bg-destructive/10 p-2 text-xs text-destructive">
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    {err}
                  </div>
                ))}
              </div>
            )}

            {task.artifacts.resultJson.metrics && Object.keys(task.artifacts.resultJson.metrics).length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">{t("tasks.detail.metrics")}</p>
                <div className="flex flex-wrap gap-3">
                  {Object.entries(task.artifacts.resultJson.metrics).map(([key, val]) => (
                    <div key={key} className="rounded bg-muted px-2 py-1 text-xs">
                      <span className="font-medium">{key}:</span> {val}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Artifact Files */}
      {task.artifacts && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileArchive className="h-4 w-4" />
              {t("tasks.detail.artifactFiles")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {artifactFiles && artifactFiles.length > 0 ? (
              <div className="space-y-1">
                {artifactFiles.map((file) => (
                  <ArtifactFileRow key={file.path} taskId={task.id} file={file} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("tasks.detail.noFiles")}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Interaction Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-4 w-4" />
            {t("tasks.detail.interactionTimeline")}
            {isActive && (
              <span className="ml-2 h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length > 0 ? (
            <div className="space-y-3">
              {logs.map((entry) => (
                <InteractionEntry key={entry.id} entry={entry} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("tasks.detail.noLogs")}</p>
          )}
        </CardContent>
      </Card>

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

function ArtifactFileRow({ taskId, file }: { taskId: string; file: ArtifactFileEntry }): React.ReactElement {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handlePreview = async (): Promise<void> => {
    if (preview !== null) {
      setPreview(null);
      return;
    }
    setLoading(true);
    try {
      const content = await api.artifacts.getFileContent(taskId, file.path);
      setPreview(content.slice(0, 10000));
    } catch {
      setPreview("Failed to load preview");
    } finally {
      setLoading(false);
    }
  };

  const sizeStr = file.size < 1024
    ? `${file.size} B`
    : file.size < 1024 * 1024
      ? `${(file.size / 1024).toFixed(1)} KB`
      : `${(file.size / (1024 * 1024)).toFixed(1)} MB`;

  const isMarkdown = file.path.endsWith(".md");

  return (
    <div className="border rounded-lg p-2">
      <div className="flex items-center gap-2">
        <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="flex-1 text-sm font-mono truncate">{file.path}</span>
        <span className="text-xs text-muted-foreground shrink-0">{sizeStr}</span>
        {file.isText && (
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={handlePreview} disabled={loading}>
            <Eye className="h-3.5 w-3.5 mr-1" />
            {t("tasks.detail.preview")}
          </Button>
        )}
        <a href={api.artifacts.downloadFileUrl(taskId, file.path)} download>
          <Button variant="ghost" size="sm" className="h-7 px-2">
            <Download className="h-3.5 w-3.5 mr-1" />
            {t("tasks.detail.download")}
          </Button>
        </a>
      </div>
      {preview !== null && (
        isMarkdown ? (
          <div className="mt-2 rounded bg-muted p-3 prose prose-sm dark:prose-invert max-w-none">
            <Markdown remarkPlugins={[remarkGfm]}>{preview}</Markdown>
          </div>
        ) : (
          <pre className="mt-2 max-h-80 overflow-auto rounded bg-muted p-3 text-xs font-mono whitespace-pre-wrap">
            {preview}
          </pre>
        )
      )}
    </div>
  );
}

const STEP_ICON: Record<InteractionStepType, typeof Brain> = {
  prompt: MessageSquare,
  thinking: Brain,
  text: MessageSquare,
  tool_call: Wrench,
  tool_call_update: Wrench,
  permission: Shield,
  fs_read: FileText,
  fs_write: FileText,
  terminal: Terminal,
  plan: ListChecks,
  error: AlertCircle,
  system: Info,
};

const STEP_STYLE: Record<InteractionStepType, { border: string; bg: string }> = {
  prompt:           { border: "border-l-blue-500",    bg: "bg-blue-50 dark:bg-blue-950/30" },
  thinking:         { border: "border-l-slate-400",   bg: "bg-slate-50 dark:bg-slate-900/40" },
  text:             { border: "border-l-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
  tool_call:        { border: "border-l-amber-500",   bg: "bg-amber-50 dark:bg-amber-950/30" },
  tool_call_update: { border: "border-l-amber-400",   bg: "bg-amber-50/60 dark:bg-amber-950/20" },
  permission:       { border: "border-l-purple-500",  bg: "bg-purple-50 dark:bg-purple-950/30" },
  fs_read:          { border: "border-l-cyan-500",    bg: "bg-cyan-50 dark:bg-cyan-950/30" },
  fs_write:         { border: "border-l-cyan-600",    bg: "bg-cyan-50 dark:bg-cyan-950/30" },
  terminal:         { border: "border-l-orange-500",  bg: "bg-orange-50 dark:bg-orange-950/30" },
  plan:             { border: "border-l-indigo-500",  bg: "bg-indigo-50 dark:bg-indigo-950/30" },
  error:            { border: "border-l-red-500",     bg: "bg-red-50 dark:bg-red-950/30" },
  system:           { border: "border-l-gray-400",    bg: "bg-gray-50 dark:bg-gray-900/30" },
};

function InteractionEntry({ entry }: { entry: InteractionLogEntry }): React.ReactElement {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(() => {
    if (entry.type === "thinking") return false;
    if (entry.type === "text" && entry.content.length > 800) return false;
    return true;
  });

  const Icon = STEP_ICON[entry.type] ?? Info;
  const style = STEP_STYLE[entry.type] ?? { border: "border-l-gray-400", bg: "" };
  const time = new Date(entry.timestamp).toLocaleTimeString();
  const typeLabel = t(`tasks.detail.interactionTypes.${entry.type}` as string) || entry.type;

  const isCollapsible = entry.content.length > 200 || entry.type === "thinking";

  const useMarkdown = entry.type === "text" || entry.type === "thinking" || entry.type === "plan";

  return (
    <div className={`border-l-3 ${style.border} rounded-r-lg overflow-hidden`}>
      {/* Header bar */}
      <div
        className={`flex items-center gap-2 px-3 py-2 ${style.bg} ${isCollapsible ? "cursor-pointer select-none" : ""}`}
        onClick={isCollapsible ? () => setExpanded(!expanded) : undefined}
      >
        <Icon className="h-4 w-4 shrink-0 opacity-70" />
        <Badge variant="outline" className="text-[10px] py-0 h-5 font-medium">{typeLabel}</Badge>
        <span className="text-[10px] text-muted-foreground font-mono">{time}</span>
        {entry.metadata?.toolName && (
          <code className="text-[10px] bg-background/60 rounded px-1.5 py-0.5 font-medium">
            {entry.metadata.toolName}
          </code>
        )}
        {entry.metadata?.status && (
          <Badge
            variant={entry.metadata.status === "completed" ? "default" : "secondary"}
            className="text-[10px] py-0 h-5"
          >
            {entry.metadata.status}
          </Badge>
        )}
        {entry.metadata?.filePath && (
          <code className="text-[10px] text-muted-foreground truncate max-w-[240px]">
            {entry.metadata.filePath}
          </code>
        )}
        {isCollapsible && (
          <span className="ml-auto shrink-0">
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </span>
        )}
      </div>

      {/* Content */}
      {(expanded || !isCollapsible) && entry.content && (
        <div className="px-4 py-3">
          {useMarkdown ? (
            <div className={`prose prose-sm dark:prose-invert max-w-none ${
              entry.type === "thinking" ? "opacity-70 italic" : ""
            }`}>
              <Markdown remarkPlugins={[remarkGfm]}>{entry.content}</Markdown>
            </div>
          ) : (entry.type === "tool_call" || entry.type === "tool_call_update") ? (
            <pre className="text-xs font-mono whitespace-pre-wrap text-foreground/80">
              {entry.content}
            </pre>
          ) : entry.type === "error" ? (
            <div className="text-sm text-destructive font-medium">{entry.content}</div>
          ) : (
            <div className="text-sm whitespace-pre-wrap text-foreground/90">{entry.content}</div>
          )}
        </div>
      )}

      {/* Collapsed preview */}
      {!expanded && isCollapsible && entry.content && (
        <div className="px-4 py-2 text-xs text-muted-foreground truncate">
          {entry.content.slice(0, 120)}…
        </div>
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
}): React.ReactElement {
  return (
    <div className={fullWidth ? "col-span-full" : ""}>
      <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
      <div>{children}</div>
    </div>
  );
}
