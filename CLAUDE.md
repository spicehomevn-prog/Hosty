# Hostexa – ghi chú cho Claude

- **Tên miền chính: `https://hostexa.vercel.app`**, khai báo duy nhất ở `site.config.js` (`PRIMARY_DOMAIN`, ghi đè bằng env `SITE_URL`).
  Dùng tên miền này trong mọi nội dung mới: README, ảnh hướng dẫn, video giới thiệu, link chia sẻ, link xuất lịch iCal.
- `hosty-rose.vercel.app` là tên miền cũ, vẫn giữ (No Redirect) vì link lịch đã dán lên sàn trỏ về đó. Không xoá, không chuyển hướng.
- Ngôn ngữ giao diện và tài liệu: tiếng Việt. Tên sản phẩm: Hostexa.
- Stack: Vite + React SPA, Vercel Functions trong `api/` (file bắt đầu bằng `_` là module dùng chung), dữ liệu trên Vercel Blob.
- Font: Cal Sans (tiêu đề), Afacad Flux (nội dung), Manrope 700 (wordmark). Icon: bộ Hostexa trong `src/lib/icons.jsx`.
- Không commit `.env`, `.hosty-sync`, `hosty.zip`.
