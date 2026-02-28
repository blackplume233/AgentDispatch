import type React from 'react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTasks } from '../hooks/use-tasks.js';
import { CreateTaskDialog } from '../components/CreateTaskDialog.js';
import type { Task, TaskStatus } from '../types.js';

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: 'pending', label: 'Pending' },
  { status: 'claimed', label: 'Claimed' },
  { status: 'in_progress', label: 'In Progress' },
  { status: 'completed', label: 'Completed' },
];

export function TasksPage(): React.ReactElement {
  const { data: tasks, isLoading, error } = useTasks();
  const [showCreate, setShowCreate] = useState(false);

  if (isLoading) return <div className="loading">Loading tasks...</div>;
  if (error) return <div className="error">Error: {error.message}</div>;

  const tasksByStatus = (status: TaskStatus): Task[] =>
    (tasks ?? []).filter((t) => t.status === status);

  return (
    <>
      <div className="page-header">
        <h1>Tasks</h1>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          + New Task
        </button>
      </div>

      <div className="kanban">
        {COLUMNS.map((col) => (
          <div key={col.status} className="kanban-column">
            <h3>{col.label} ({tasksByStatus(col.status).length})</h3>
            {tasksByStatus(col.status).map((task) => (
              <Link key={task.id} to={`/tasks/${task.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="kanban-card">
                  <h4>{task.title}</h4>
                  <div className="meta">
                    <span className={`badge badge-${task.priority}`}>{task.priority}</span>
                    {task.progress !== undefined && (
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${task.progress}%` }} />
                      </div>
                    )}
                  </div>
                  {task.tags.length > 0 && (
                    <div className="tags" style={{ marginTop: 4 }}>
                      {task.tags.map((tag) => <span key={tag} className="tag">{tag}</span>)}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        ))}
      </div>

      {/* Show failed/cancelled below */}
      {(tasks ?? []).filter((t) => t.status === 'failed' || t.status === 'cancelled').length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ color: 'var(--text-muted)', marginBottom: 12 }}>Failed / Cancelled</h3>
          {(tasks ?? [])
            .filter((t) => t.status === 'failed' || t.status === 'cancelled')
            .map((task) => (
              <Link key={task.id} to={`/tasks/${task.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className={`badge badge-${task.status}`}>{task.status}</span>
                  <span>{task.title}</span>
                </div>
              </Link>
            ))}
        </div>
      )}

      {showCreate && <CreateTaskDialog onClose={() => setShowCreate(false)} />}
    </>
  );
}
