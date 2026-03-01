import type React from "react";
import { useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/multi-select";
import { useCreateTask } from "@/hooks/use-tasks";
import { useWorkerTags } from "@/hooks/use-worker-tags";
import type { TaskPriority } from "@/types";

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_FILE_COUNT = 20;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

interface CreateTaskDialogProps {
  onClose: () => void;
}

export function CreateTaskDialog({ onClose }: CreateTaskDialogProps): React.ReactElement {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mutation = useCreateTask();
  const { tags: availableTags } = useWorkerTags();

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const incoming = Array.from(newFiles);
    setFiles((prev) => {
      const combined = [...prev];
      for (const file of incoming) {
        if (combined.length >= MAX_FILE_COUNT) break;
        if (file.size > MAX_FILE_SIZE) continue;
        if (!combined.some((f) => f.name === file.name && f.size === file.size)) {
          combined.push(file);
        }
      }
      return combined;
    });
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }, [addFiles]);

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    mutation.mutate(
      {
        input: {
          title,
          description: description || undefined,
          tags,
          priority,
        },
        files: files.length > 0 ? files : undefined,
      },
      { onSuccess: () => onClose() },
    );
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("tasks.createTitle")}</DialogTitle>
          <DialogDescription>{t("tasks.createDescription")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">{t("tasks.fieldTitle")}</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">{t("tasks.fieldDescription")}</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("tasks.fieldTags")}</Label>
            <MultiSelect
              options={availableTags}
              selected={tags}
              onChange={setTags}
              placeholder={t("tasks.fieldTagsPlaceholder")}
              emptyText={t("tasks.fieldTagsEmpty")}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("tasks.fieldPriority")}</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* File attachments */}
          <div className="space-y-2">
            <Label>{t("tasks.fieldAttachments")}</Label>
            <div
              className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                dragOver
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-muted-foreground/50"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <p className="text-sm text-muted-foreground">
                {t("tasks.attachmentDropHint")}
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                {t("tasks.attachmentSizeHint", { maxSize: "50 MB", maxCount: MAX_FILE_COUNT })}
              </p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
            {files.length > 0 && (
              <ul className="space-y-1 mt-2">
                {files.map((file, i) => (
                  <li
                    key={`${file.name}-${file.size}`}
                    className="flex items-center justify-between text-sm bg-muted/50 rounded px-2 py-1"
                  >
                    <span className="truncate mr-2">{file.name}</span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground">
                        {formatFileSize(file.size)}
                      </span>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-destructive text-xs"
                        onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                      >
                        &times;
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? t("tasks.creating") : t("common.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
