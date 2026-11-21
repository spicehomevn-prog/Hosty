// GET /api/health — kiểm tra cấu hình máy chủ (chỉ báo có/thiếu, không bao giờ trả giá trị biến)
import { route, send } from './_http.js';
import { storeMode, getJSON } from './_store.js';
import { configStatus } from './_auth.js';

export default route(async (req, res) => {
  const mode = storeMode();
  let storage = mode ? 'ok' : 'thiếu BLOB_READ_WRITE_TOKEN (kết nối Vercel Blob)';
  if (mode) {
    try { await getJSON('workspaces.json'); } catch (e) { storage = `lỗi: ${String(e.message).slice(0, 120)}`; }
  }
  const c = configStatus();
  const ok = storage === 'ok' && c.authSecret === 'ok' && c.ownerUsername === 'ok' && c.ownerPassword === 'ok';
  send(res, 200, {
    ok,
    'Lưu trữ (Vercel Blob)': storage,
    AUTH_SECRET: c.authSecret,
    HOSTY_OWNER_USERNAME: c.ownerUsername,
    HOSTY_OWNER_PASSWORD: c.ownerPassword,
    'Số ký tự tên đăng nhập chủ hệ thống': c.ownerUsernameLength,
    // chỉ TÊN biến (không có giá trị) để phát hiện gõ sai tên, ví dụ thiếu chữ hay dư khoảng trắng
    'Tên biến máy chủ thấy': Object.keys(process.env).filter((k) => /hosty|owner|auth_secret/i.test(k)).map((k) => JSON.stringify(k)),
    'Môi trường Vercel': process.env.VERCEL_ENV || 'local',
  });
}, { needStore: false });
