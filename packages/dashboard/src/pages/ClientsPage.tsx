import type React from 'react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Search, Monitor } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/common/status-badge';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { useClients } from '@/hooks/use-clients';

export function ClientsPage(): React.ReactElement {
  const { t } = useTranslation();
  const { data: clients, isLoading, error } = useClients();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    let result = clients ?? [];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.host.toLowerCase().includes(q) ||
          c.tags.some((tag) => tag.toLowerCase().includes(q)),
      );
    }
    return result;
  }, [clients, search]);

  if (error) {
    return (
      <div className="flex items-center justify-center py-16 text-destructive">
        {t('common.error')}: {error.message}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{t('clients.title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('clients.subtitle')}</p>
      </div>

      <div className="relative w-full max-w-xs">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t('clients.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 && (clients ?? []).length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <Monitor className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium">{t('clients.noClients')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('clients.noClientsHint')}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-8 text-center">
          <Monitor className="mb-2 h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">{t('clients.noMatch')}</p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('clients.name')}</TableHead>
                <TableHead>{t('clients.status')}</TableHead>
                <TableHead>{t('clients.host')}</TableHead>
                <TableHead>{t('clients.dispatchMode')}</TableHead>
                <TableHead>{t('clients.agents')}</TableHead>
                <TableHead>{t('clients.lastHeartbeat')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((client) => (
                <TableRow key={client.id} className="cursor-pointer">
                  <TableCell>
                    <Link to={`/clients/${client.id}`} className="font-medium hover:underline">
                      {client.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={client.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{client.host}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-normal capitalize">
                      {client.dispatchMode}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatAgentGroupSummary(client.agents)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(client.lastHeartbeat).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function formatAgentGroupSummary(
  agents: Array<{ id: string; groupId?: string; status: string }>,
): string {
  const groups = new Set<string>();
  let busy = 0;
  for (const agent of agents) {
    groups.add(resolveGroupId(agent.id, agent.groupId));
    if (agent.status === 'busy') {
      busy += 1;
    }
  }
  return `${groups.size} groups / ${busy}/${agents.length} busy`;
}

function resolveGroupId(agentId: string, groupId?: string): string {
  if (groupId && groupId.trim().length > 0) return groupId;
  const match = /^(.*):(\d+)$/.exec(agentId);
  return match?.[1] ?? agentId;
}
