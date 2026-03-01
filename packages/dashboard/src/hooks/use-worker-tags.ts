import { useMemo } from "react";
import { useClients } from "@/hooks/use-clients";

/**
 * Derives available worker tags from registered clients.
 * Collects client-level tags + worker agent capabilities, deduped and sorted.
 */
export function useWorkerTags(): { tags: string[]; isLoading: boolean } {
  const { data: clients, isLoading } = useClients();

  const tags = useMemo(() => {
    if (!clients) return [];
    const set = new Set<string>();
    for (const client of clients) {
      for (const tag of client.tags) set.add(tag);
      for (const agent of client.agents) {
        if (agent.type === "worker") {
          for (const cap of agent.capabilities) set.add(cap);
        }
      }
    }
    return Array.from(set).sort();
  }, [clients]);

  return { tags, isLoading };
}
