import { describe, it, expect } from 'vitest';
import { OperationQueue } from '../../src/queue/operation-queue.js';

describe('OperationQueue', () => {
  it('should execute operations in FIFO order', async () => {
    const queue = new OperationQueue();
    const results: number[] = [];

    await Promise.all([
      queue.enqueue({
        type: 'test',
        execute: async () => {
          results.push(1);
        },
      }),
      queue.enqueue({
        type: 'test',
        execute: async () => {
          results.push(2);
        },
      }),
      queue.enqueue({
        type: 'test',
        execute: async () => {
          results.push(3);
        },
      }),
    ]);

    expect(results).toEqual([1, 2, 3]);
  });

  it('should reject when queue is full', async () => {
    const queue = new OperationQueue(1);

    const slowOp = queue.enqueue({
      type: 'slow',
      execute: () => new Promise((resolve) => setTimeout(resolve, 100)),
    });

    await expect(
      queue.enqueue({
        type: 'overflow',
        execute: async () => {},
      }),
    ).rejects.toThrow('queue is full');

    await slowOp;
  });

  it('should report correct size', async () => {
    const queue = new OperationQueue();
    expect(queue.size()).toBe(0);
  });

  it('should drain all pending operations', async () => {
    const queue = new OperationQueue();
    let count = 0;

    void queue.enqueue({
      type: 'test',
      execute: async () => {
        count++;
      },
    });
    void queue.enqueue({
      type: 'test',
      execute: async () => {
        count++;
      },
    });

    await queue.drain();
    expect(count).toBe(2);
  });

  it('should propagate errors from operations', async () => {
    const queue = new OperationQueue();

    await expect(
      queue.enqueue({
        type: 'failing',
        execute: async () => {
          throw new Error('test error');
        },
      }),
    ).rejects.toThrow('test error');
  });
});
