import type React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useClient } from '../hooks/use-clients.js';

export function ClientDetailPage(): React.ReactElement {
  const { id = '' } = useParams<{ id: string }>();
  const { data: client, isLoading, error } = useClient(id);

  if (isLoading) return <div className="loading">Loading client...</div>;
  if (error) return <div className="error">Error: {error.message}</div>;
  if (!client) return <div className="error">Client not found</div>;

  return (
    <>
      <div className="page-header">
        <h1>{client.name}</h1>
        <Link to="/clients" className="btn">Back to Clients</Link>
      </div>

      <div className="card">
        <div className="detail-grid">
          <span className="detail-label">ID</span>
          <span className="detail-value" style={{ fontFamily: 'monospace' }}>{client.id}</span>
          <span className="detail-label">Status</span>
          <span className="detail-value"><span className={`badge badge-${client.status}`}>{client.status}</span></span>
          <span className="detail-label">Host</span>
          <span className="detail-value">{client.host}</span>
          <span className="detail-label">Dispatch Mode</span>
          <span className="detail-value">{client.dispatchMode}</span>
          <span className="detail-label">Tags</span>
          <span className="detail-value"><div className="tags">{client.tags.map((t) => <span key={t} className="tag">{t}</span>)}</div></span>
          <span className="detail-label">Registered</span>
          <span className="detail-value">{new Date(client.registeredAt).toLocaleString()}</span>
          <span className="detail-label">Last Heartbeat</span>
          <span className="detail-value">{new Date(client.lastHeartbeat).toLocaleString()}</span>
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <h3 style={{ marginBottom: 12 }}>Agents ({client.agents.length})</h3>
        {client.agents.length === 0 ? (
          <div className="card" style={{ color: 'var(--text-muted)' }}>No agents registered</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Type</th>
                <th>Status</th>
                <th>Current Task</th>
                <th>Capabilities</th>
              </tr>
            </thead>
            <tbody>
              {client.agents.map((agent) => (
                <tr key={agent.id}>
                  <td style={{ fontFamily: 'monospace' }}>{agent.id}</td>
                  <td>{agent.type}</td>
                  <td><span className={`badge badge-${agent.status === 'idle' ? 'online' : agent.status === 'busy' ? 'busy' : 'offline'}`}>{agent.status}</span></td>
                  <td>{agent.currentTaskId ? <Link to={`/tasks/${agent.currentTaskId}`}>{agent.currentTaskId.slice(0, 8)}...</Link> : '—'}</td>
                  <td><div className="tags">{agent.capabilities.map((c) => <span key={c} className="tag">{c}</span>)}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
