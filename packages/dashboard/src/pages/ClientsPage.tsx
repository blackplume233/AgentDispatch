import type React from 'react';
import { Link } from 'react-router-dom';
import { useClients } from '../hooks/use-clients.js';

export function ClientsPage(): React.ReactElement {
  const { data: clients, isLoading, error } = useClients();

  if (isLoading) return <div className="loading">Loading clients...</div>;
  if (error) return <div className="error">Error: {error.message}</div>;

  return (
    <>
      <div className="page-header">
        <h1>Clients</h1>
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Status</th>
            <th>Host</th>
            <th>Dispatch Mode</th>
            <th>Agents</th>
            <th>Last Heartbeat</th>
          </tr>
        </thead>
        <tbody>
          {(clients ?? []).map((client) => (
            <tr key={client.id}>
              <td><Link to={`/clients/${client.id}`}>{client.name}</Link></td>
              <td><span className={`badge badge-${client.status}`}>{client.status}</span></td>
              <td>{client.host}</td>
              <td>{client.dispatchMode}</td>
              <td>{client.agents.length}</td>
              <td>{new Date(client.lastHeartbeat).toLocaleString()}</td>
            </tr>
          ))}
          {(clients ?? []).length === 0 && (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No clients registered</td></tr>
          )}
        </tbody>
      </table>
    </>
  );
}
