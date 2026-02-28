import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { ArtifactFileEntry } from "@/types";

export function useArtifactFiles(taskId: string | undefined, hasArtifacts: boolean): ReturnType<typeof useQuery<ArtifactFileEntry[]>> {
  return useQuery({
    queryKey: ["artifact-files", taskId],
    queryFn: () => api.artifacts.listFiles(taskId as string),
    enabled: !!taskId && hasArtifacts,
  });
}
