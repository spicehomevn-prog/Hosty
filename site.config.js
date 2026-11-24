// Tên miền chính của Hostexa. Đổi ở đây (hoặc đặt biến môi trường SITE_URL trên Vercel) khi chuyển tên miền.
// Tên miền cũ hosty-rose.vercel.app vẫn được giữ trên Vercel (không chuyển hướng) để link lịch đã dán lên sàn tiếp tục chạy.
export const PRIMARY_DOMAIN = 'hostexa.vercel.app';

/** URL gốc của trang, không có dấu / ở cuối, ví dụ https://hostexa.vercel.app */
export const siteUrl = (env = process.env) => {
  const raw = env.SITE_URL || PRIMARY_DOMAIN;
  return (raw.startsWith('http') ? raw : `https://${raw}`).replace(/\/$/, '');
};

/** Số Zalo nhận yêu cầu nâng cấp gói Pro (để trống = chỉ hiện thông báo). Có thể ghi đè bằng env VITE_UPGRADE_ZALO lúc build. */
export const UPGRADE_ZALO = '';
