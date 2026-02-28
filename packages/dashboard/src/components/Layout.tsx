import type React from 'react';
import { Link, useLocation } from 'react-router-dom';

export function Layout({ children }: { children: React.ReactNode }): React.ReactElement {
  const location = useLocation();
  const isActive = (path: string): string => location.pathname.startsWith(path) ? 'active' : '';

  return (
    <div className="layout">
      <aside className="sidebar">
        <h2>AgentDispatch</h2>
        <nav>
          <Link to="/tasks" className={isActive('/tasks')}>Tasks</Link>
          <Link to="/clients" className={isActive('/clients')}>Clients</Link>
        </nav>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
