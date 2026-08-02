import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const geminiKey =
    env.GEMINI_API_KEY ||
    env.API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.API_KEY ||
    '';

  // Only lock the build to a variant when VITE_APP_VARIANT is explicitly
  // set. Unset means the web/dev/test build where every role is available.
  const rawVariant = (
    process.env.VITE_APP_VARIANT ||
    env.VITE_APP_VARIANT ||
    ''
  ).toLowerCase();
  const variant: 'coach' | 'student' | null =
    rawVariant === 'coach' || rawVariant === 'student' ? rawVariant : null;
  const outDir =
    variant === 'student'
      ? 'dist-student'
      : variant === 'coach'
        ? 'dist-coach'
        : 'dist';

  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: env.VITE_API_BASE_URL || 'http://localhost:4000',
          changeOrigin: true,
        },
      },
    },
    plugins: [react()],
    build: {
      outDir,
      emptyOutDir: true,
    },
    define: {
      'process.env.API_KEY': JSON.stringify(geminiKey),
      'process.env.GEMINI_API_KEY': JSON.stringify(geminiKey),
      ...(variant
        ? { 'import.meta.env.VITE_APP_VARIANT': JSON.stringify(variant) }
        : {}),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./vitest.setup.ts'],
    },
  };
});
