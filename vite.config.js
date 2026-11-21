import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Khi chạy local (npm run dev), giả lập các Vercel function trong thư mục api/
const devApi = () => ({
  name: 'dev-api',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const m = req.url.match(/^\/api\/(ical|sync)(\?|$)/);
      if (!m) return next();
      const { default: handler } = await server.ssrLoadModule(`/api/${m[1]}.js`);
      handler(req, res);
    });
  },
});

export default defineConfig(({ mode }) => {
  // Nạp BLOB_READ_WRITE_TOKEN từ file .env (nếu có); không có thì lưu gói đồng bộ vào thư mục .hosty-sync/
  const env = loadEnv(mode, process.cwd(), '');
  if (env.BLOB_READ_WRITE_TOKEN) process.env.BLOB_READ_WRITE_TOKEN = env.BLOB_READ_WRITE_TOKEN;
  else process.env.HOSTY_LOCAL_STORE = '1';
  return { plugins: [react(), devApi()] };
});
