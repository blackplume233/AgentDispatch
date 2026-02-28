import { useEffect, useRef, useState, useCallback } from "react";
import { api } from "@/api/client";
import type { ClientLogEntry } from "@/types";

const POLL_INTERVAL = 5000;

export function useClientLogs(clientId: string | undefined, isActive: boolean) {
  const [logs, setLogs] = useState<ClientLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const lastIdRef = useRef<string | undefined>(undefined);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLogs = useCallback(async () => {
    if (!clientId) return;
    try {
      const entries = await api.clientLogs.list(clientId, lastIdRef.current);
      if (entries.length > 0) {
        lastIdRef.current = entries[entries.length - 1]!.id;
        setLogs((prev) => [...prev, ...entries]);
      }
    } catch {
      // silently ignore polling errors
    }
  }, [clientId]);

  useEffect(() => {
    if (!clientId) return;
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
  }, [clientId, isActive, fetchLogs]);

  return { logs, loading };
}
