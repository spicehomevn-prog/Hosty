// GET /api/health — kiểm tra cấu hình máy chủ (chỉ báo có/thiếu, không bao giờ trả giá trị biến)
import { route, send } from './_http.js';
import { storeMode, getJSON, blobAccess } from './_store.js';
import { configStatus, envClean } from './_auth.js';
import { apifyTokenStatus } from './_apify.js';

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
    'APIFY_TOKEN (giá Airbnb)': apifyTokenStatus(),
    'CRON_SECRET (cập nhật giá hằng tháng + gửi thông báo nhắc task)': envClean(process.env.CRON_SECRET).length >= 16 ? 'ok' : (process.env.CRON_SECRET ? 'quá ngắn (cần ≥ 16 ký tự)' : 'thiếu'),
    // chỉ TÊN biến (không có giá trị) để phát hiện gõ sai tên, ví dụ thiếu chữ hay dư khoảng trắng
    'Tên biến máy chủ thấy': Object.keys(process.env).filter((k) => /hosty|owner|auth_secret|apify|cron|vapid/i.test(k)).map((k) => JSON.stringify(k)),
    'Chế độ Blob': mode === 'blob' ? (blobAccess() === 'public' ? 'public – nên tạo Blob store loại Private (dữ liệu nhạy cảm)' : blobAccess() || 'chưa xác định') : mode,
    'Môi trường Vercel': process.env.VERCEL_ENV || 'local',
  });
}, { needStore: false });
