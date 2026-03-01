import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../helpers/render';
import { TasksPage } from '@/pages/TasksPage';

const mockTasks = [
  {
    id: 'task-1',
    title: 'Backend API refactor',
    status: 'pending',
    priority: 'high',
    tags: ['backend', 'api'],
    progress: 0,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'task-2',
    title: 'Frontend dashboard',
    status: 'in_progress',
    priority: 'normal',
    tags: ['frontend'],
    progress: 50,
    createdAt: '2026-01-02T00:00:00Z',
    updatedAt: '2026-01-02T12:00:00Z',
  },
  {
    id: 'task-3',
    title: 'Completed task',
    status: 'completed',
    priority: 'low',
    tags: ['test'],
    progress: 100,
    createdAt: '2026-01-03T00:00:00Z',
    updatedAt: '2026-01-03T00:00:00Z',
  },
];

vi.mock('@/hooks/use-tasks', () => ({
  useTasks: () => ({ data: mockTasks, isLoading: false, error: null }),
  useArchivedTasks: () => ({ data: [], isLoading: false, error: null }),
  useCreateTask: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/use-worker-tags', () => ({
  useWorkerTags: () => ({ data: ['backend', 'frontend', 'test'], isLoading: false }),
}));

describe('TasksPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders task titles', () => {
    renderWithProviders(<TasksPage />);
    expect(screen.getByText('Backend API refactor')).toBeInTheDocument();
    expect(screen.getByText('Frontend dashboard')).toBeInTheDocument();
    expect(screen.getByText('Completed task')).toBeInTheDocument();
  });

  it('shows "New Task" button', () => {
    renderWithProviders(<TasksPage />);
    expect(screen.getByText('tasks.newTask')).toBeInTheDocument();
  });

  it('filters tasks by search', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TasksPage />);

    const searchInput = screen.getByPlaceholderText('tasks.searchPlaceholder');
    await user.type(searchInput, 'Backend');

    expect(screen.getByText('Backend API refactor')).toBeInTheDocument();
    expect(screen.queryByText('Frontend dashboard')).not.toBeInTheDocument();
  });

  it('shows status filter badges', () => {
    renderWithProviders(<TasksPage />);
    expect(screen.getByText('common.all')).toBeInTheDocument();
    expect(screen.getByText('pending')).toBeInTheDocument();
    expect(screen.getByText('completed')).toBeInTheDocument();
  });

  it('renders task tags', () => {
    renderWithProviders(<TasksPage />);
    expect(screen.getByText('backend')).toBeInTheDocument();
    expect(screen.getByText('frontend')).toBeInTheDocument();
  });
});
