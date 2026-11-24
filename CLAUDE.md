# Hostexa – ghi chú cho Claude

- **Tên miền chính: `https://hostexa.vercel.app`**, khai báo duy nhất ở `site.config.js` (`PRIMARY_DOMAIN`, ghi đè bằng env `SITE_URL`).
  Dùng tên miền này trong mọi nội dung mới: README, ảnh hướng dẫn, video giới thiệu, link chia sẻ, link xuất lịch iCal.
- `hosty-rose.vercel.app` là tên miền cũ, vẫn giữ (No Redirect) vì link lịch đã dán lên sàn trỏ về đó. Không xoá, không chuyển hướng.
- Ngôn ngữ giao diện và tài liệu: tiếng Việt. Tên sản phẩm: Hostexa.
- Stack: Vite + React SPA, Vercel Functions trong `api/` (file bắt đầu bằng `_` là module dùng chung), dữ liệu trên Vercel Blob.
- Font: Cal Sans (tiêu đề), Afacad Flux (nội dung), Manrope 700 (wordmark). Icon: bộ Hostexa trong `src/lib/icons.jsx`.
- Tài chính: chỉ owner/admin (`can(role,'finance')`, máy chủ kiểm tra lại trong `api/finance.js`). Dữ liệu tiền KHÔNG được đưa vào `ws/<id>.json` (`SYNC_KEYS`) vì member tải file đó; luôn để trong `fin/<id>.json`.
- Giá Airbnb theo ngày lấy qua Apify (actor `scrapercompany/scrapercompany-hotel-rates`, endpoint `/v1/airbnb/calendar`) chỉ ở máy chủ (`api/_apify.js`), token trong env `APIFY_TOKEN`, không bao giờ gửi xuống trình duyệt. Chạy hằng tháng (cron `?cron=ota`) + nút chạy tay (1 lần/giờ).
- Không commit `.env`, `.hosty-sync`, `hosty.zip`.
- Nhắc hẹn task: chỉ Web Push (đã bỏ kết nối Google Calendar OAuth; form task vẫn có "Thêm tay vào lịch" .ics / link Google). `public/sw.js`, VAPID tự tạo trong `notify/vapid.json`, gửi qua `/api/notify?cron=push` mỗi 5 phút bằng cron ngoài + `CRON_SECRET`. Logic ở `api/_notify.js` (`pushDue` = task, `stayDue` = tổng quan 8:00 + trả/nhận phòng trước 1 giờ, đọc lịch sàn qua `api/_feeds.js` đệm 1 giờ). Mỗi người bật/tắt từng loại (`prefs`).
- Gói dùng thử: `plan: 'trial'` trên cơ sở trong `workspaces.json` (thiếu = Pro). Hằng số + hàm ở `src/lib/plan.js` (dùng chung app + máy chủ). Đăng ký `POST /api/auth {action:'signup'}`; máy chủ chặn Pro bằng `requirePro` (`api/_auth.js`), giới hạn phòng ở `api/data.js`. Giao diện khoá dùng `openUpgrade(feature)` / `LockedRow` / `LockBadge` (`src/components/Upgrade.jsx`). Hết hạn -> vai trò hiệu lực `viewer` (chỉ xem).
