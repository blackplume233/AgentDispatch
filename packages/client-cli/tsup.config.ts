import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ['@agentdispatch/shared'],
  banner: { js: '#!/usr/bin/env node' },
});
