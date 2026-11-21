# Hostexa – theo dõi đặt phòng, dọn phòng & task cho khách sạn / homestay

Web app (React + Vite) chạy trên Vercel. Đồng bộ lịch từ Airbnb, Booking.com, Agoda… qua link iCal. Dữ liệu từng cơ sở lưu trên Vercel Blob, đăng nhập trên máy nào cũng thấy cùng dữ liệu.

## Tính năng
- **Tài khoản 3 cấp** (không có tự đăng ký):
  - **Chủ hệ thống** – khai báo bằng biến môi trường. Tạo cơ sở, tạo / khoá / xoá tài khoản, đặt lại mật khẩu, xem mọi cơ sở.
  - **`<cơ sở>-admin`** – toàn quyền với dữ liệu cơ sở của mình: phòng, lịch iCal, giờ nhận/trả, đặt phòng, task, ghi chú.
  - **`<cơ sở>-member`, `-member2`…** – nhân viên dọn phòng: xem lịch & thẻ dọn phòng, tick đã dọn, tick task được giao, đọc ghi chú, copy thẻ.
- **Tự đồng bộ**: khi mở app, mỗi 15 phút, 20 giây sau lần sửa cuối, khi chuyển app xuống nền, khi có mạng trở lại, hoặc bấm *Đồng bộ ngay*. Hai máy sửa cùng lúc được gộp theo từng mục (task, ghi chú, phòng…), không mất dữ liệu. Mất mạng vẫn dùng được, có mạng sẽ tự đồng bộ.
- **Thiết lập cơ sở** (admin): tên cơ sở → số địa điểm → địa chỉ + số phòng + tên phòng → link iCal của từng sàn cho từng phòng, giờ nhận/trả phòng riêng cho từng lịch.
- **Lịch đặt phòng** theo Tuần / Tháng, **thẻ dọn phòng** theo tuần/tháng hoặc từng ngày, ghi rõ ai đã dọn lúc mấy giờ, **copy thẻ** gửi Zalo, **ghi chú ngày**, **task** (giao cho từng nhân viên), đặt phòng thủ công.
- Font: **Cal Sans** cho tiêu đề & heading, **Afacad Flux** cho chữ nội dung (Google Fonts, hỗ trợ tiếng Việt).

## Cài đặt trên Vercel (một lần)
1. **Bật Vercel Blob**: project trên vercel.com → **Storage** → **Create Database** → **Blob** → đặt tên (vd. `hosty-data`) → **Create** → chọn project (tick Production/Preview/Development) → **Connect**. Vercel tự thêm biến `BLOB_READ_WRITE_TOKEN`.
2. **Thêm biến môi trường**: **Settings → Environment Variables**:

   | Tên biến | Giá trị |
   |---|---|
   | `HOSTY_OWNER_USERNAME` | tên đăng nhập của chủ hệ thống, vd. `chu` |
   | `HOSTY_OWNER_PASSWORD` | mật khẩu mạnh của chủ hệ thống |
   | `AUTH_SECRET` | chuỗi ngẫu nhiên dài ≥ 32 ký tự (dùng để ký phiên đăng nhập) |

   Tạo `AUTH_SECRET` nhanh: chạy `openssl rand -base64 32` hoặc gõ bừa một chuỗi dài. Đổi `AUTH_SECRET` sẽ đăng xuất mọi người; đổi `HOSTY_OWNER_PASSWORD` sẽ đăng xuất chủ hệ thống trên mọi máy.
3. **Deployments → Redeploy** để áp dụng.

## Quy trình sử dụng
1. Chủ hệ thống đăng nhập → **Tạo cơ sở mới** → Hostexa tự tạo tài khoản `<cơ sở>-admin` và hiện mật khẩu → bấm **Copy để gửi** qua Zalo.
2. Admin cơ sở đăng nhập → trả lời 4 câu hỏi thiết lập phòng & lịch iCal.
3. Chủ hệ thống vào **Quản lý tài khoản** → **Thêm member** cho từng nhân viên dọn phòng (tên đăng nhập tự sinh, sửa được).
4. Admin tạo task và chọn **Giao cho** nhân viên. Nhân viên tick dọn phòng / task trên điện thoại; mọi máy tự cập nhật.

Quên mật khẩu: chủ hệ thống bấm biểu tượng chìa khoá cạnh tài khoản để đặt lại (phiên cũ trên mọi máy bị đăng xuất). Mỗi người có thể tự đổi mật khẩu ở **Cơ sở → Tài khoản**.

> Gói Blob miễn phí của Vercel giới hạn dung lượng và số lượt đọc/ghi mỗi tháng. Mỗi lần đồng bộ dùng 1 lượt đọc (+1 lượt ghi nếu có thay đổi). Với vài cơ sở và chục thiết bị thường là đủ; nếu vượt, Vercel sẽ báo trong mục Usage.

## Chạy local
```bash
npm install
npm run dev
```
Khi chạy local mà chưa có biến môi trường: dữ liệu lưu trong thư mục `.hosty-sync/`, chủ hệ thống mặc định là `owner` / `hosty-owner` (**chỉ dùng khi chạy local**). Muốn đổi, tạo file `.env` với các biến như trên (thêm `BLOB_READ_WRITE_TOKEN` nếu muốn dùng Blob thật).

## Deploy lên Vercel
Cách 1 – qua GitHub: đẩy thư mục này lên một repo GitHub → vercel.com → **Add New → Project** → chọn repo → **Deploy**, sau đó làm phần *Cài đặt trên Vercel* ở trên.

Cách 2 – dùng CLI:
```bash
npx vercel --prod
```

## Cấu trúc API (Vercel Functions)
- `api/ical.js` – tải file iCal từ các sàn (tránh lỗi CORS).
- `api/auth.js` – đăng nhập, đổi mật khẩu, thông tin tài khoản.
- `api/data.js` – đọc/ghi dữ liệu cơ sở (ghi có điều kiện theo phiên bản, kiểm tra quyền member phía server).
- `api/admin.js` – quản lý cơ sở & tài khoản (chỉ chủ hệ thống).

## Nhận diện
Logo, bảng màu và bộ icon theo "Hostexa — Relay identity": biểu tượng đường relay Midnight Plum `#241A3B` với điểm đầu Violet `#7C5CE6` và điểm cuối Coral `#F0845A`; chữ Manrope 700. Icon nằm trong `src/lib/icons.jsx` (lưới 24, nét 2px, đầu tròn, một nét nhấn violet/coral, một màu khi nhỏ hơn 20px).

> Tên biến môi trường (`HOSTY_OWNER_USERNAME`, `HOSTY_OWNER_PASSWORD`) và nơi lưu dữ liệu giữ nguyên tên cũ để không phải cấu hình lại.
