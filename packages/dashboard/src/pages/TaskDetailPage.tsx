import type React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTask } from '../hooks/use-tasks.js';

export function TaskDetailPage(): React.ReactElement {
  const { id = '' } = useParams<{ id: string }>();
  const { data: task, isLoading, error } = useTask(id);

  if (isLoading) return <div className="loading">Loading task...</div>;
  if (error) return <div className="error">Error: {error.message}</div>;
  if (!task) return <div className="error">Task not found</div>;

  return (
    <>
      <div className="page-header">
        <h1>{task.title}</h1>
        <Link to="/tasks" className="btn">Back to Tasks</Link>
      </div>

      <div className="card">
        <div className="detail-grid">
          <span className="detail-label">ID</span>
          <span className="detail-value" style={{ fontFamily: 'monospace' }}>{task.id}</span>

          <span className="detail-label">Status</span>
          <span className="detail-value"><span className={`badge badge-${task.status}`}>{task.status}</span></span>

          <span className="detail-label">Priority</span>
          <span className="detail-value">{task.priority}</span>

          <span className="detail-label">Tags</span>
          <span className="detail-value">
            <div className="tags">{task.tags.map((t) => <span key={t} className="tag">{t}</span>)}</div>
          </span>

          {task.progress !== undefined && (
            <>
              <span className="detail-label">Progress</span>
              <span className="detail-value">
                {task.progress}%
                <div className="progress-bar" style={{ maxWidth: 300 }}>
                  <div className="progress-fill" style={{ width: `${task.progress}%` }} />
                </div>
                {task.progressMessage && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{task.progressMessage}</div>}
              </span>
            </>
          )}

          {task.claimedBy && (
            <>
              <span className="detail-label">Claimed By</span>
              <span className="detail-value">Client: {task.claimedBy.clientId} / Agent: {task.claimedBy.agentId}</span>
            </>
          )}

          <span className="detail-label">Created</span>
          <span className="detail-value">{new Date(task.createdAt).toLocaleString()}</span>

          <span className="detail-label">Updated</span>
          <span className="detail-value">{new Date(task.updatedAt).toLocaleString()}</span>

          {task.completedAt && (
            <>
              <span className="detail-label">Completed</span>
              <span className="detail-value">{new Date(task.completedAt).toLocaleString()}</span>
            </>
          )}
        </div>
      </div>

      {task.description && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 8 }}>Description</h3>
          <div style={{ whiteSpace: 'pre-wrap' }}>{task.description}</div>
        </div>
      )}

      {task.artifacts && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 8 }}>Artifacts</h3>
          <div className="detail-grid">
            <span className="detail-label">Zip File</span>
            <span className="detail-value">{task.artifacts.zipFile}</span>
            <span className="detail-label">Size</span>
            <span className="detail-value">{(task.artifacts.zipSizeBytes / 1024).toFixed(1)} KB</span>
            <span className="detail-label">Hash</span>
            <span className="detail-value" style={{ fontFamily: 'monospace', fontSize: 12 }}>{task.artifacts.zipHash}</span>
            <span className="detail-label">Summary</span>
            <span className="detail-value">{task.artifacts.resultJson.summary}</span>
            <span className="detail-label">Success</span>
            <span className="detail-value">{task.artifacts.resultJson.success ? 'Yes' : 'No'}</span>
          </div>
        </div>
      )}

      {task.metadata && Object.keys(task.metadata).length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 8 }}>Metadata</h3>
          <pre style={{ fontSize: 12, background: 'var(--bg)', padding: 12, borderRadius: 6, overflow: 'auto' }}>
            {JSON.stringify(task.metadata, null, 2)}
          </pre>
        </div>
      )}
    </>
  );
}
