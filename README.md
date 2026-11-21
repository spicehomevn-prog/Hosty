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

> Dữ liệu được lưu trong trình duyệt (localStorage) của từng thiết bị.

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
