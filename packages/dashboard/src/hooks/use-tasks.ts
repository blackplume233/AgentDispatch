import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { Task, CreateTaskInput } from "@/types";

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

export function useCreateTask(): ReturnType<typeof useMutation<Task, Error, CreateTaskInput>> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTaskInput) => api.tasks.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}
