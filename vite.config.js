import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Khi chạy local (npm run dev), giả lập các Vercel function trong thư mục api/
const devApi = () => ({
  name: 'dev-api',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const m = req.url.match(/^\/api\/(ical-out|ical|auth|data|admin|health)(\?|$)/) || (req.url.startsWith('/cal/') && [null, 'ical-out']);
      if (!m) return next();
      const { default: handler } = await server.ssrLoadModule(`/api/${m[1]}.js`);
      handler(req, res);
    });
  },
});

// Địa chỉ đầy đủ của trang cho thẻ xem trước khi chia sẻ link (og:image bắt buộc là URL tuyệt đối).
// Trên Vercel lấy tên miền production tự động; có thể đặt SITE_URL để ghi đè.
const siteUrl = () => {
  const raw = process.env.SITE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || 'hosty-rose.vercel.app';
  return (raw.startsWith('http') ? raw : `https://${raw}`).replace(/\/$/, '');
};
const siteMeta = () => ({
  name: 'site-url',
  transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', siteUrl()),
});

export default defineConfig(({ mode, command }) => {
  if (command === 'serve') {
    // Nạp biến từ file .env (nếu có). Thiếu thì dùng giá trị mặc định CHỈ DÀNH CHO CHẠY LOCAL.
    const env = loadEnv(mode, process.cwd(), '');
    for (const k of ['BLOB_READ_WRITE_TOKEN', 'AUTH_SECRET', 'HOSTY_OWNER_USERNAME', 'HOSTY_OWNER_PASSWORD']) {
      if (env[k]) process.env[k] = env[k];
    }
    if (!process.env.BLOB_READ_WRITE_TOKEN) process.env.HOSTY_LOCAL_STORE = '1';
    process.env.AUTH_SECRET ||= 'hosty-local-dev-secret-change-me';
    process.env.HOSTY_OWNER_USERNAME ||= 'owner';
    process.env.HOSTY_OWNER_PASSWORD ||= 'hosty-owner';
  }
  return { plugins: [react(), devApi(), siteMeta()] };
});
