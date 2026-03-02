import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../helpers/render';
import { TaskDetailPage } from '@/pages/TaskDetailPage';
import type { InteractionLogEntry, Task } from '@/types';

const mockUseTask = vi.fn();
const mockUseTaskLogs = vi.fn();
const mockUseArtifactFiles = vi.fn();

vi.mock('@/hooks/use-tasks', () => ({
  useTask: (id: string) => mockUseTask(id),
}));

vi.mock('@/hooks/use-task-logs', () => ({
  useTaskLogs: (id: string, isActive: boolean) => mockUseTaskLogs(id, isActive),
}));

vi.mock('@/hooks/use-artifact-files', () => ({
  useArtifactFiles: (id: string, enabled: boolean) => mockUseArtifactFiles(id, enabled),
}));

function renderTaskDetail() {
  return renderWithProviders(
    <Routes>
      <Route path="/tasks/:id" element={<TaskDetailPage />} />
    </Routes>,
    {
      wrapperOptions: {
        routerProps: { initialEntries: ['/tasks/task-1'] },
      },
    },
  );
}

function createTask(status: Task['status'] = 'completed'): Task {
  return {
    id: 'task-1',
    title: 'Task Detail Test',
    status,
    priority: 'normal',
    tags: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

describe('TaskDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseTask.mockReturnValue({ data: createTask(), isLoading: false, error: null, refetch: vi.fn() });
    mockUseArtifactFiles.mockReturnValue({ data: [] });
  });

  it('groups consecutive same tool calls and keeps step count at top-level entries', async () => {
    const logs: InteractionLogEntry[] = [
      {
        id: '1',
        timestamp: '2026-01-01T00:00:00Z',
        type: 'tool_call',
        content: 'alpha-call',
        metadata: { sessionId: 's1', toolCallId: 'a-1', toolName: 'ToolA' },
      },
      {
        id: '2',
        timestamp: '2026-01-01T00:00:01Z',
        type: 'tool_call_update',
        content: 'alpha-update',
        metadata: { sessionId: 's1', toolCallId: 'a-1', toolName: 'ToolA' },
      },
      {
        id: '3',
        timestamp: '2026-01-01T00:00:02Z',
        type: 'tool_call',
        content: 'beta-call',
        metadata: { sessionId: 's1', toolCallId: 'a-2', toolName: 'ToolA' },
      },
      {
        id: '4',
        timestamp: '2026-01-01T00:00:03Z',
        type: 'tool_call_update',
        content: 'beta-update',
        metadata: { sessionId: 's1', toolCallId: 'a-2', toolName: 'ToolA' },
      },
      {
        id: '5',
        timestamp: '2026-01-01T00:00:04Z',
        type: 'text',
        content: 'visible text message',
        metadata: { sessionId: 's1' },
      },
      {
        id: '6',
        timestamp: '2026-01-01T00:00:05Z',
        type: 'tool_call',
        content: 'gamma-call',
        metadata: { sessionId: 's1', toolCallId: 'b-1', toolName: 'ToolB' },
      },
      {
        id: '7',
        timestamp: '2026-01-01T00:00:06Z',
        type: 'tool_call_update',
        content: 'gamma-update',
        metadata: { sessionId: 's1', toolCallId: 'b-2', toolName: 'ToolB' },
      },
    ];
    mockUseTaskLogs.mockReturnValue({ logs, loading: false });

    const user = userEvent.setup();
    renderTaskDetail();

    await user.click(screen.getByText('tasks.detail.interactionTimeline'));

    expect(screen.getAllByText('tasks.detail.toolCallGroup')).toHaveLength(2);
    expect(screen.getByText('tasks.detail.interactionTypes.text')).toBeInTheDocument();

    expect(screen.queryByText('alpha-call')).not.toBeInTheDocument();
    const expandButtons = screen.getAllByLabelText('tasks.detail.toolCallGroupExpand');
    await user.click(expandButtons[0]!);
    await user.click(expandButtons[1]!);

    expect(screen.getAllByText('tasks.detail.interactionTypes.tool_call')).toHaveLength(3);
    expect(screen.getAllByText('tasks.detail.interactionTypes.tool_call_update')).toHaveLength(1);
  });

  it('expands only text entries by default and collapses non-text entries', async () => {
    const logs: InteractionLogEntry[] = [
      {
        id: 't1',
        timestamp: '2026-01-01T00:00:00Z',
        type: 'text',
        content: 'text is expanded by default',
        metadata: { sessionId: 's1' },
      },
      {
        id: 't2',
        timestamp: '2026-01-01T00:00:01Z',
        type: 'thinking',
        content: 'thinking-start ' + 'x'.repeat(150) + ' thinking-tail-marker',
        metadata: { sessionId: 's1' },
      },
    ];
    mockUseTaskLogs.mockReturnValue({ logs, loading: false });

    const user = userEvent.setup();
    renderTaskDetail();
    await user.click(screen.getByText('tasks.detail.interactionTimeline'));

    expect(screen.getByText('text is expanded by default')).toBeInTheDocument();
    expect(screen.queryByText('thinking-tail-marker')).not.toBeInTheDocument();
  });
});
