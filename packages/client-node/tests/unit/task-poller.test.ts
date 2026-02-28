import { describe, it, expect, vi, afterEach } from 'vitest';
import { TaskPoller } from '../../src/polling/task-poller.js';

describe('TaskPoller', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should poll at configured interval', async () => {
    const mockTasks = [
      {
        id: '1',
        title: 'Test',
        status: 'pending' as const,
        tags: [],
        priority: 'normal' as const,
        createdAt: '',
        updatedAt: '',
      },
    ];
    const mockClient = { listTasks: vi.fn().mockResolvedValue(mockTasks) } as any;
    const callback = vi.fn();

    const poller = new TaskPoller(mockClient, 50, callback);
    poller.start();
    expect(poller.isRunning()).toBe(true);

    await new Promise((r) => setTimeout(r, 120));
    poller.stop();

    expect(mockClient.listTasks).toHaveBeenCalled();
    expect(callback).toHaveBeenCalledWith(mockTasks);
  });
});
