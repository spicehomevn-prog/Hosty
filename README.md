# Hostexa – theo dõi đặt phòng, dọn phòng & task cho khách sạn / homestay

**Địa chỉ chính: https://hostexa.vercel.app** (khai báo trong `site.config.js`).

Web app (React + Vite) chạy trên Vercel. Đồng bộ lịch từ Airbnb, Booking.com, Agoda… qua link iCal. Dữ liệu từng cơ sở lưu trên Vercel Blob, đăng nhập trên máy nào cũng thấy cùng dữ liệu.

## Tính năng
- **Tài khoản 3 cấp** (không có tự đăng ký):
  - **Chủ hệ thống** – khai báo bằng biến môi trường. Tạo cơ sở, tạo / khoá / xoá tài khoản, đặt lại mật khẩu, xem mọi cơ sở.
  - **`<cơ sở>-admin`** – toàn quyền với dữ liệu cơ sở của mình: phòng, lịch iCal, giờ nhận/trả, đặt phòng, task, ghi chú.
  - **`<cơ sở>-member`, `-member2`…** – thành viên, chọn loại:
    - **Dọn phòng** (cây chổi): màn riêng chữ to, chỉ thẻ dọn phòng (giờ trả / nhận phòng, số đêm, ghi chú) và việc được giao. Không có lịch phòng, giá, tên khách, số điện thoại, sàn.
    - **Nhân viên** (hình người): xem lịch, đặt phòng, giá đặt phòng (chỉ xem), tick dọn phòng / task.
  - Admin **gán địa điểm** cho từng thành viên (Cơ sở → Nhân viên & dọn phòng). Thành viên chỉ nhận dữ liệu, thông báo và task của địa điểm được gán; chưa gán = mọi địa điểm.
- **Tự đồng bộ**: khi mở app, mỗi 15 phút, 20 giây sau lần sửa cuối, khi chuyển app xuống nền, khi có mạng trở lại, hoặc bấm *Đồng bộ ngay*. Hai máy sửa cùng lúc được gộp theo từng mục (task, ghi chú, phòng…), không mất dữ liệu. Mất mạng vẫn dùng được, có mạng sẽ tự đồng bộ.
- **Thiết lập cơ sở** (admin): tên cơ sở → số địa điểm → địa chỉ + số phòng + tên phòng → link iCal của từng sàn cho từng phòng, giờ nhận/trả phòng riêng cho từng lịch.
- **Đồng bộ ngược lên sàn**: Cơ sở → *Lấy link xuất lịch*. Mỗi phòng có link iCal riêng cho từng sàn (vd. "Dán vào Airbnb") gồm khách đặt trực tiếp + khách từ các sàn khác, đã loại khách của chính sàn đó để không chặn vòng. Dán vào mục *Nhập lịch* của sàn để sàn tự chặn ngày. Link có chữ ký bảo mật, không chứa tên/SĐT khách; đổi `AUTH_SECRET` sẽ vô hiệu mọi link cũ.
- **Lịch đặt phòng** theo Tuần / Tháng, **thẻ dọn phòng** theo tuần/tháng hoặc từng ngày, ghi rõ ai đã dọn lúc mấy giờ, **copy thẻ** gửi Zalo, **ghi chú ngày**, **task** (giao cho từng nhân viên), đặt phòng thủ công.
- **Tài chính** (chỉ chủ hệ thống & admin cơ sở; tài khoản dọn phòng không thấy và máy chủ cũng từ chối): doanh thu theo sàn, chi phí (phí sàn, thuế % trên doanh thu, lương nhân viên, chi phí khác – khoản lặp lại hằng tháng tự cộng), lợi nhuận, giá TB/đêm, biểu đồ 6 tháng. Doanh thu chia theo đêm ở.
  - Đặt phòng trực tiếp: **bắt buộc nhập giá** khi tạo.
  - Đặt phòng từ sàn (iCal không có giá): **Bảng giá** – chọn các ngày trên lịch và áp chung một giá một đêm cho phòng; giá đặt phòng = tổng giá các đêm. Số thực tế lấy từ **file báo cáo** của sàn, hoặc nhập tay từng đặt phòng. Ưu tiên: nhập tay > file báo cáo > bảng giá.
  - **Giá các sàn theo ngày (Apify)**: Tài chính → Cài đặt → dán link của từng phòng trên **Airbnb**, **Booking.com** (dạng `booking.com/hotel/vn/<tên>.html`), **Agoda** (link có `-h<mã>` / `hotelId=` hoặc mã cơ sở trong Agoda YCS). Máy chủ chạy actor *Hotel Rates API* (`scrapercompany/scrapercompany-hotel-rates`) lấy giá từng đêm còn trống của tháng này và tháng sau, tự chạy **ngày 1 hằng tháng** (Vercel Cron) và khi admin bấm *Cập nhật giá các sàn ngay* (**tối đa 2 lần / tháng / cơ sở**; chủ hệ thống không giới hạn; lượt không lấy được giá nào được trả lại). Đặt phòng của sàn nào tính theo giá sàn đó, đêm không có giá dùng Bảng giá.
    - Airbnb: `/v1/airbnb/calendar`, khoảng $0,06 mỗi phòng mỗi lần.
    - Booking.com: `/v1/ota/booking` – lịch giá 2 tháng, $0,018 mỗi trang; giá thấp nhất của trang (chưa gồm thuế/phí), nhiều phòng dùng chung 1 trang thì chỉ chạy 1 lần.
    - Agoda: `/v1/ota/agoda` – 1 đêm 1 lượt ($0,018), tối đa ~60 đêm mỗi cơ sở Agoda, bỏ đêm mà mọi phòng dùng chung cơ sở đều đã có khách; chọn được loại phòng; Agoda không hỗ trợ VND nên lấy USD rồi đổi theo tỷ giá tự động (open.er-api.com), không lấy được thì dùng tỷ giá dự phòng trong Cài đặt.
  - **Giảm giá**: theo số đêm ở (từ 7 / 28 đêm, chung hoặc riêng từng phòng), theo ngày trên Bảng giá (%), và cho từng đặt phòng (% hoặc số tiền). Doanh thu và phí sàn tính trên giá sau giảm.
  - Tháng trước khi dùng app: nhập tay **số tổng** của tháng, hoặc **tải file báo cáo** xuất từ Airbnb / Booking.com / Agoda (CSV, XLSX) – app tự nhận cột, ghép phòng, bỏ dòng đã huỷ.
- Font: **Cal Sans** cho tiêu đề & heading, **Afacad Flux** cho chữ nội dung (Google Fonts, hỗ trợ tiếng Việt).

## Tên miền
- Tên miền chính là `hostexa.vercel.app`, dùng cho thẻ xem trước khi chia sẻ link và cho mọi link xuất lịch iCal mới.
- Tên miền cũ `hosty-rose.vercel.app` vẫn được giữ trên Vercel (**No Redirect**) để các link lịch đã dán lên sàn tiếp tục chạy. Chỉ xoá khi đã dán lại link mới vào mọi sàn.
- Đổi sang tên miền khác: sửa `PRIMARY_DOMAIN` trong `site.config.js`, hoặc đặt biến môi trường `SITE_URL` (vd. `https://hostexa.vn`), rồi Redeploy.

## Cài đặt trên Vercel (một lần)
1. **Bật Vercel Blob**: project trên vercel.com → **Storage** → **Create Database** → **Blob** → đặt tên (vd. `hosty-data`) → **Create** → chọn project (tick Production/Preview/Development) → **Connect**. Vercel tự thêm biến `BLOB_READ_WRITE_TOKEN`.
2. **Thêm biến môi trường**: **Settings → Environment Variables**:

   | Tên biến | Giá trị |
   |---|---|
   | `HOSTY_OWNER_USERNAME` | tên đăng nhập của chủ hệ thống, vd. `chu` |
   | `HOSTY_OWNER_PASSWORD` | mật khẩu mạnh của chủ hệ thống |
   | `AUTH_SECRET` | chuỗi ngẫu nhiên dài ≥ 32 ký tự (dùng để ký phiên đăng nhập) |
   | `APIFY_TOKEN` | API token của Apify (Apify Console → Settings → API & Integrations) – để lấy giá Airbnb / Booking.com / Agoda theo ngày. Không có thì bỏ qua tính năng này |
   | `CRON_SECRET` | chuỗi ngẫu nhiên dài ≥ 16 ký tự – để Vercel Cron tự cập nhật giá Airbnb ngày 1 hằng tháng, và để dịch vụ hẹn giờ gọi gửi thông báo nhắc task |

   Tạo `AUTH_SECRET` nhanh: chạy `openssl rand -base64 32` hoặc gõ bừa một chuỗi dài. Đổi `AUTH_SECRET` sẽ đăng xuất mọi người; đổi `HOSTY_OWNER_PASSWORD` sẽ đăng xuất chủ hệ thống trên mọi máy.
3. **Deployments → Redeploy** để áp dụng.

## Thông báo (nhắc hẹn)
Mỗi người tự bật ở **Cơ sở → Thông báo** (hoặc nút **Cài đặt nhắc hẹn** trong form task) và chọn loại muốn nhận:
- **Tổng quan lúc 8:00** – "Chào buổi sáng, <tên>": số lượt trả phòng, nhận phòng hôm nay và số khoản phải thu tiền phòng (phần tiền chỉ gửi cho chủ hệ thống / admin).
- **Trả phòng** – trước giờ trả phòng 1 tiếng, từng phòng (giờ theo cài đặt lịch của phòng, mặc định 12:00).
- **Nhận phòng** – trước giờ nhận phòng 1 tiếng, từng phòng (mặc định 14:00; đặt phòng trực tiếp còn nợ thì kèm số còn phải thu cho admin).
- **Nhắc task** – task giao riêng chỉ nhắc người được giao; task "Chung" nhắc mọi người đã bật.

Máy chủ tự đọc lịch iCal của các sàn (tối đa 1 lần/giờ) để biết lượt nhận / trả phòng, dùng cùng cách tính với app (ẩn lịch khoá do đặt phòng trực tiếp).

**Thông báo đẩy của Hostexa** – gửi thẳng tới điện thoại / máy tính đã bấm **Bật thông báo**. iPhone cần iOS 16.4+ và phải mở Hostexa từ biểu tượng ngoài Màn hình chính (Safari → Chia sẻ → Thêm vào MH chính). Khoá gửi thông báo (VAPID) máy chủ tự tạo lần đầu. Vì Vercel gói miễn phí chỉ chạy hẹn giờ 1 lần/ngày, cần một dịch vụ hẹn giờ miễn phí gọi máy chủ mỗi 5 phút:
1. Đặt biến `CRON_SECRET` trên Vercel (nếu chưa có) → Redeploy.
2. Tạo tài khoản [cron-job.org](https://cron-job.org) → **Create cronjob**: URL `https://hostexa.vercel.app/api/notify?cron=push`, lịch **Every 5 minutes**; tab **Advanced → Headers** thêm `Authorization` = `Bearer <CRON_SECRET>`.
3. Kiểm tra: tab **History** của cronjob báo `200`. Thông báo có thể đến trễ tối đa ~5 phút so với giờ nhắc.

Ngoài ra trong form task vẫn có **Thêm tay vào lịch** (.ics cho iPhone, link Google Calendar) – thêm một lần, không tự cập nhật.

## Gói dịch vụ
| Gói | Phòng | Địa điểm | Nhân viên | 1 tháng | 3 tháng (−5%) | 6 tháng (−8%) |
|---|---|---|---|---|---|---|
| Dùng thử 14 ngày | 5 | 1 | 2 | miễn phí | | |
| Cơ bản | 5 | 1 | 2 | 65.000 ₫ | 185.000 ₫ | 359.000 ₫ |
| Nâng cao | 15 | không giới hạn | 5 | 129.000 ₫ | 368.000 ₫ | 712.000 ₫ |
| Cao cấp | 30 | không giới hạn | 10 | 199.000 ₫ | 567.000 ₫ | 1.098.000 ₫ |
| VIP | không giới hạn | không giới hạn | không giới hạn | chủ hệ thống gán | | |

- Giá chưa gồm VAT, combo làm tròn tới nghìn. Bảng giá và giới hạn nằm ở `src/lib/plan.js` (dùng chung app + máy chủ).
- Dùng thử: có **đủ tính năng như gói Cơ bản** (Tài chính, Thông báo đẩy, Bảng giá), chỉ giới hạn 14 ngày. **Giá tự động từ sàn (Apify) chỉ có ở VIP** (cơ sở riêng của chủ, ví dụ Spicehome).
- Màn đăng nhập có nút **Đăng ký tài khoản dùng thử miễn phí**: khách nhập tên cơ sở, họ tên, SĐT, mật khẩu → hệ thống tự tạo cơ sở dùng thử + tài khoản admin (đăng nhập bằng SĐT). Chống spam: tối đa 3 lần đăng ký / IP / ngày, tối đa 200 cơ sở dùng thử.
- Hết hạn (dùng thử hoặc gói trả phí): dữ liệu **chỉ xem** cho tới khi gia hạn. Máy chủ chặn ghi, tài chính, thông báo.
- Giới hạn phòng / địa điểm chỉ chặn khi **thêm** vượt giới hạn: cơ sở cũ có sẵn nhiều phòng vẫn sửa được. Admin cơ sở tự thêm nhân viên trong giới hạn gói (Cơ sở → Tài khoản).
- Khách bấm khoá / nhãn gói → hộp **Gói Hostexa**: chọn gói + 1/3/6 tháng → nút Zalo copy sẵn lời nhắn có gói và số tiền. Thu tiền thủ công.
- Chủ hệ thống: **Quản lý tài khoản** → chọn gói cho từng cơ sở, bấm **+1 / +3 / +6 tháng** khi nhận tiền (cộng từ hạn hiện tại, ghi lịch sử thanh toán). Lần đầu chọn gói trả phí: hạn 1 tháng.
- Cơ sở cũ chưa có gói (hoặc gói `pro` cũ) = **Cao cấp, không hạn** cho tới khi chủ hệ thống chọn gói. Nhớ chọn **VIP** cho Spicehome.
- Số Zalo nhận yêu cầu nâng cấp: `UPGRADE_ZALO` trong `site.config.js` (hoặc biến `VITE_UPGRADE_ZALO` lúc build).
- Chế độ xem thử với dữ liệu mẫu vẫn còn qua đường dẫn `/?demo` (để làm video, ảnh hướng dẫn).

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
- `api/_scope.js` – lọc dữ liệu theo địa điểm được gán và loại thành viên (Dọn phòng không nhận tên khách / sàn / link lịch). Dùng ở `data`, `ical` (`?ws&cal=` – máy chủ tự đọc lịch), `finance` (`?view=prices` cho Nhân viên), thông báo.
- `api/admin.js` – quản lý cơ sở & tài khoản (chỉ chủ hệ thống).
- `api/ical-out.js` – lịch iCal xuất cho các sàn, truy cập qua `/cal/<mã>.ics`.
- `api/finance.js` – dữ liệu tài chính (chỉ owner/admin): bảng giá, giá đặt phòng, khoản chi, số tổng tháng cũ; `POST ?action=ota` / Cron `?cron=ota` lấy giá Airbnb / Booking.com / Agoda qua Apify (`api/_apify.js`). Lưu riêng ở `fin/<cơ sở>.json`, không nằm trong dữ liệu mà member tải về.
- `api/notify.js` – nhắc hẹn task: đăng ký thông báo đẩy, `?cron=push` gửi thông báo tới giờ (`api/_notify.js`, service worker `public/sw.js`).
- `api/health.js` – kiểm tra cấu hình máy chủ (chỉ báo có/thiếu).

## Nhận diện
Logo, bảng màu và bộ icon theo "Hostexa — Relay identity": biểu tượng đường relay Midnight Plum `#241A3B` với điểm đầu Violet `#7C5CE6` và điểm cuối Coral `#F0845A`; chữ Manrope 700. Icon nằm trong `src/lib/icons.jsx` (lưới 24, nét 2px, đầu tròn, một nét nhấn violet/coral, một màu khi nhỏ hơn 20px).

> Tên biến môi trường (`HOSTY_OWNER_USERNAME`, `HOSTY_OWNER_PASSWORD`) và nơi lưu dữ liệu giữ nguyên tên cũ để không phải cấu hình lại.
