import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Khi chạy local (npm run dev), giả lập Vercel function /api/ical
const devApi = () => ({
  name: 'dev-api-ical',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (!req.url.startsWith('/api/ical')) return next();
      const { default: handler } = await import('./api/ical.js');
      handler(req, res);
    });
  },
});

export default defineConfig({ plugins: [react(), devApi()] });
