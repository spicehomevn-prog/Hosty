# Hosty – theo dõi đặt phòng, dọn phòng & task cho khách sạn / homestay

Web app (React + Vite) chạy trên Vercel. Đồng bộ lịch từ Airbnb, Booking.com, Agoda… qua link iCal.

## Tính năng
- **Thiết lập lần đầu**: tên cơ sở → số địa điểm → địa chỉ + số phòng + tên phòng → link iCal của từng sàn cho từng phòng (nút **+** để thêm lịch), giờ nhận/trả phòng riêng cho từng lịch → tạo lịch.
- **Lịch đặt phòng**: xem theo **Tuần** (dòng thời gian theo phòng) hoặc **Tháng**, lọc theo địa điểm, màu theo sàn.
- **Thẻ dọn phòng**: mặc định hiển thị cho cả tuần/tháng đang xem; bấm vào một ngày để xem riêng ngày đó. Đánh dấu đã dọn, cảnh báo **Gấp** khi khách mới nhận phòng cùng ngày.
- **Copy thẻ dọn phòng** (từng thẻ hoặc tất cả) để gửi Zalo/Messenger cho nhân viên – kèm ghi chú ngày.
- **Ghi chú riêng cho mỗi ngày**, **Task**, đặt phòng thủ công (khách trực tiếp).
- Chọn font: Be Vietnam Pro (mặc định), Plus Jakarta Sans, Lexend, Manrope.
- Tự đồng bộ iCal mỗi 30 phút khi app mở. Xuất/nhập dữ liệu JSON để sao lưu.
- **Đồng bộ sang máy khác bằng mã**: Cơ sở → *Đóng gói & tạo mã* → nhận mã 8 ký tự + mã QR. Máy khác: *Nhập mã đồng bộ* (màn chào) hoặc Cơ sở → *Nhận dữ liệu từ máy khác*, hoặc quét QR. *Cập nhật gói* để đẩy thay đổi mới; máy kia sẽ thấy thông báo "Có dữ liệu mới" ở trang Tổng quan.

> Dữ liệu được lưu trong trình duyệt (localStorage) của từng thiết bị; gói đồng bộ được lưu trên Vercel Blob.

## Bật lưu trữ đồng bộ (Vercel Blob) – bắt buộc để dùng mã đồng bộ
1. Mở project trên vercel.com → tab **Storage** → **Create Database** → chọn **Blob** → đặt tên (vd. `hosty-sync`) → **Create**.
2. Ở bước kết nối, chọn project Hosty (tick cả Production/Preview/Development) → **Connect**. Vercel tự thêm biến `BLOB_READ_WRITE_TOKEN`.
3. Vào **Deployments** → bấm **Redeploy** bản mới nhất để áp dụng.

Khi chạy local (`npm run dev`) mà chưa có token, gói đồng bộ được lưu tạm trong thư mục `.hosty-sync/` trên máy (dùng thử được giữa các trình duyệt/điện thoại trong cùng mạng). Muốn local dùng Blob thật: tạo file `.env` chứa `BLOB_READ_WRITE_TOKEN=...` (lấy ở Storage → Blob → `.env.local`).

## Chạy local
```bash
npm install
npm run dev
```

## Deploy lên Vercel
Cách 1 – qua GitHub: đẩy thư mục này lên một repo GitHub → vào vercel.com → **Add New → Project** → chọn repo → **Deploy** (Vercel tự nhận Vite, không cần cấu hình thêm).

Cách 2 – dùng CLI:
```bash
npx vercel --prod
```

Hàm `api/ical.js` là Vercel Serverless Function dùng để tải file iCal từ các sàn (tránh lỗi CORS của trình duyệt).
