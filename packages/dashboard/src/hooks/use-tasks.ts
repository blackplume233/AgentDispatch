import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { Task, TaskSummary, CreateTaskInput } from "@/types";

export function useTasks(): ReturnType<typeof useQuery<Task[]>> {
  return useQuery({
    queryKey: ["tasks"],
    queryFn: () => api.tasks.list(),
    refetchInterval: 5000,
  });
}

export function useTask(id: string): ReturnType<typeof useQuery<Task>> {
  return useQuery({
    queryKey: ["tasks", id],
    queryFn: () => api.tasks.get(id),
    refetchInterval: 3000,
  });
}

export function useArchivedTasks(): ReturnType<typeof useQuery<TaskSummary[]>> {
  return useQuery({
    queryKey: ["tasks", "archived"],
    queryFn: () => api.tasks.listArchived(),
    refetchInterval: 60000,
  });
}

export function useCreateTask(): ReturnType<typeof useMutation<Task, Error, { input: CreateTaskInput; files?: File[] }>> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ input, files }: { input: CreateTaskInput; files?: File[] }) =>
      api.tasks.create(input, files),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}
