import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../helpers/render';
import { ClientsPage } from '@/pages/ClientsPage';

const mockClients = [
  {
    id: 'client-1',
    name: 'dev-node-1',
    status: 'online',
    host: 'server-a.local',
    dispatchMode: 'tag-auto',
    agents: [
      { id: 'w1', type: 'worker', status: 'idle', capabilities: ['backend'] },
    ],
    tags: ['backend'],
    lastHeartbeat: '2026-01-01T12:00:00Z',
    registeredAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'client-2',
    name: 'ci-runner',
    status: 'offline',
    host: 'ci.example.com',
    dispatchMode: 'hybrid',
    agents: [],
    tags: ['ci'],
    lastHeartbeat: '2026-01-01T10:00:00Z',
    registeredAt: '2026-01-01T00:00:00Z',
  },
];

vi.mock('@/hooks/use-clients', () => ({
  useClients: () => ({ data: mockClients, isLoading: false, error: null }),
  useClient: () => ({ data: null, isLoading: false }),
}));

describe('ClientsPage', () => {
  it('renders client names', () => {
    renderWithProviders(<ClientsPage />);
    expect(screen.getByText('dev-node-1')).toBeInTheDocument();
    expect(screen.getByText('ci-runner')).toBeInTheDocument();
  });

  it('shows client hosts', () => {
    renderWithProviders(<ClientsPage />);
    expect(screen.getByText('server-a.local')).toBeInTheDocument();
    expect(screen.getByText('ci.example.com')).toBeInTheDocument();
  });

  it('shows status badges', () => {
    renderWithProviders(<ClientsPage />);
    expect(screen.getByText('online')).toBeInTheDocument();
    expect(screen.getByText('offline')).toBeInTheDocument();
  });

  it('filters clients by search', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ClientsPage />);

    const searchInput = screen.getByPlaceholderText('clients.searchPlaceholder');
    await user.type(searchInput, 'dev-node');

    expect(screen.getByText('dev-node-1')).toBeInTheDocument();
    expect(screen.queryByText('ci-runner')).not.toBeInTheDocument();
  });

  it('shows dispatch mode', () => {
    renderWithProviders(<ClientsPage />);
    expect(screen.getByText('tag-auto')).toBeInTheDocument();
    expect(screen.getByText('hybrid')).toBeInTheDocument();
  });
});
