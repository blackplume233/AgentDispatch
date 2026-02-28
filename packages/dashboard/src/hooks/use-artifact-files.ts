import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";

export function useArtifactFiles(taskId: string | undefined, hasArtifacts: boolean) {
  return useQuery({
    queryKey: ["artifact-files", taskId],
    queryFn: () => api.artifacts.listFiles(taskId!),
    enabled: !!taskId && hasArtifacts,
  });
}
