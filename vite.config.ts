import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    define: {
      // Maps process.env.API_KEY used in code to the variable loaded from .env or Docker
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
      'process.env': {}
    },
    server: {
      host: true, // Needed for Docker
      port: 3000
    }
  };
});