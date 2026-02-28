import { useEffect, useRef, useState, useCallback } from "react";
import { api } from "@/api/client";
import type { InteractionLogEntry } from "@/types";

const POLL_INTERVAL = 2000;

export function useTaskLogs(taskId: string | undefined, isActive: boolean) {
  const [logs, setLogs] = useState<InteractionLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const lastIdRef = useRef<string | undefined>(undefined);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLogs = useCallback(async () => {
    if (!taskId) return;
    try {
      const entries = await api.taskLogs.list(taskId, lastIdRef.current);
      if (entries.length > 0) {
        lastIdRef.current = entries[entries.length - 1]!.id;
        setLogs((prev) => [...prev, ...entries]);
      }
    } catch {
      // silently ignore polling errors
    }
  }, [taskId]);

  useEffect(() => {
    if (!taskId) return;
    setLogs([]);
    lastIdRef.current = undefined;
    setLoading(true);

    void fetchLogs().finally(() => setLoading(false));

    if (isActive) {
      timerRef.current = setInterval(fetchLogs, POLL_INTERVAL);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [taskId, isActive, fetchLogs]);

  return { logs, loading };
}
