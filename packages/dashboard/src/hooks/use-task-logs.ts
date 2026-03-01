import { useEffect, useRef, useState, useCallback } from "react";
import { api } from "@/api/client";
import type { InteractionLogEntry } from "@/types";

const POLL_INTERVAL = 2000;
const TOKEN_KEY = "dispatch_token";

function buildStreamUrl(taskId: string): string {
  return `/api/v1/tasks/${taskId}/stream?interval=1500&logs=true`;
}

export function useTaskLogs(taskId: string | undefined, isActive: boolean): { logs: InteractionLogEntry[]; loading: boolean } {
  const [logs, setLogs] = useState<InteractionLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const lastIdRef = useRef<string | undefined>(undefined);
  const cleanupRef = useRef<(() => void) | null>(null);

  const fetchLogs = useCallback(async () => {
    if (!taskId) return;
    try {
      const entries = await api.taskLogs.list(taskId, lastIdRef.current);
      if (entries.length > 0) {
        lastIdRef.current = entries[entries.length - 1]?.id;
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

    if (!isActive) return;

    // Try SSE first, fall back to polling if EventSource is unavailable or fails
    const token = localStorage.getItem(TOKEN_KEY);
    let usedSSE = false;

    if (typeof EventSource !== "undefined") {
      try {
        const url = buildStreamUrl(taskId);
        const es = new EventSource(
          token ? `${url}&token=${encodeURIComponent(token)}` : url,
        );
        usedSSE = true;

        es.addEventListener("logs", (e: MessageEvent) => {
          try {
            const entries = JSON.parse(e.data) as InteractionLogEntry[];
            if (entries.length > 0) {
              lastIdRef.current = entries[entries.length - 1]?.id;
              setLogs((prev) => [...prev, ...entries]);
            }
          } catch { /* ignore parse errors */ }
        });

        es.addEventListener("done", () => {
          es.close();
        });

        es.addEventListener("error", () => {
          // If SSE fails, the browser will auto-reconnect (built-in behavior)
        });

        cleanupRef.current = () => es.close();
      } catch {
        usedSSE = false;
      }
    }

    if (!usedSSE) {
      const timer = setInterval(fetchLogs, POLL_INTERVAL);
      cleanupRef.current = () => clearInterval(timer);
    }

    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [taskId, isActive, fetchLogs]);

  return { logs, loading };
}
