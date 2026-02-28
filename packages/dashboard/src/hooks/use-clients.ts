import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";

export function useClients() {
  return useQuery({
    queryKey: ["clients"],
    queryFn: () => api.clients.list(),
    refetchInterval: 10000,
  });
}

export function useClient(id: string) {
  return useQuery({
    queryKey: ["clients", id],
    queryFn: () => api.clients.get(id),
    refetchInterval: 5000,
  });
}
