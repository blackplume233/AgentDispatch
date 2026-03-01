import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

function remoteAccessGuard(): Plugin {
  return {
    name: 'dashboard-remote-access-guard',
    configureServer(server) {
      const h = server.config.server.host;
      const isExposed = h === true || h === '0.0.0.0' || h === '::';
      if (!isExposed) return;

      server.httpServer?.once('listening', () => {
        const apiUrl = process.env['VITE_API_URL'] || 'http://localhost:9800';
        server.config.logger.warn(
          '\n' +
          '  ⚠  Dashboard is exposed to all network interfaces.\n' +
          `     API target: ${apiUrl}\n` +
          '     Ensure server.config.json has auth.enabled=true and at least one user in auth.users.\n',
        );
      });
    },
  };
}

export default defineConfig(() => {
  const rawHost = process.env['VITE_DASHBOARD_HOST'];
  const host = rawHost === 'true' || rawHost === '0.0.0.0' || rawHost === '::'
    ? true
    : rawHost || false;

  const apiUrl = process.env['VITE_API_URL'] || 'http://localhost:9800';

  return {
    plugins: [react(), tailwindcss(), remoteAccessGuard()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      host,
      port: Number(process.env['VITE_DASHBOARD_PORT'] || 3000),
      proxy: {
        '/api': {
          target: apiUrl,
          changeOrigin: true,
        },
        '/health': {
          target: apiUrl,
          changeOrigin: true,
        },
      },
    },
  };
});
