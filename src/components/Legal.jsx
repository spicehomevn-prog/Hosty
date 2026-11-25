import { useEffect } from 'react';
import { ChevronLeft } from '../lib/icons.jsx';
import { SUPPORT_ZALO } from '../../site.config.js';
import { POLICY_DATE, OPERATOR } from '../lib/legal.js';
import { Logo } from './Logo.jsx';

export const LEGAL_PATHS = { '/chinh-sach-bao-mat': 'privacy', '/dieu-khoan': 'terms' };
const ZALO = (import.meta.env?.VITE_SUPPORT_ZALO || SUPPORT_ZALO || '').replace(/\D/g, '');
const zaloPretty = ZALO.replace(/^(\d{4})(\d{3})(\d+)$/, '$1 $2 $3');

function Contact() {
  const rows = [
    OPERATOR.name && ['Đơn vị vận hành', OPERATOR.name],
    OPERATOR.taxId && ['Mã số thuế / ĐKKD', OPERATOR.taxId],
    OPERATOR.address && ['Địa chỉ', OPERATOR.address],
    OPERATOR.email && ['Email', OPERATOR.email],
    ZALO && ['Zalo hỗ trợ', zaloPretty],
  ].filter(Boolean);
  return (
    <dl className="legal-contact">
      {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
    </dl>
  );
}

function Privacy() {
  return (
    <>
      <h1>Chính sách bảo mật dữ liệu cá nhân</h1>
      <p className="muted">Áp dụng từ {POLICY_DATE} · Hostexa (hostexa.vercel.app)</p>
      <p>Hostexa là phần mềm quản lý lịch đặt phòng, dọn phòng, task và tài chính cho khách sạn, homestay. Trang này giải thích Hostexa thu thập dữ liệu cá nhân nào, dùng để làm gì, lưu ở đâu và bạn có những quyền gì, theo Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 và Nghị định 356/2025/NĐ-CP.</p>

      <h2>1. Dữ liệu chúng tôi thu thập</h2>
      <ul>
        <li><b>Tài khoản:</b> họ tên, số điện thoại (dùng làm tên đăng nhập), tên cơ sở, mật khẩu (chỉ lưu dạng băm, không đọc lại được), thời điểm bạn đồng ý Điều khoản và Chính sách này.</li>
        <li><b>Dữ liệu cơ sở do bạn nhập:</b> địa điểm, phòng, lịch đặt phòng (kể cả tên khách, ghi chú, số điện thoại khách nếu bạn nhập), thẻ dọn phòng, task, giá phòng, thu chi và các khoản thanh toán của cơ sở, đường dẫn lịch iCal của các sàn.</li>
        <li><b>Tài khoản nhân viên:</b> tên, tên đăng nhập, vai trò và địa điểm được giao do quản trị cơ sở tạo.</li>
        <li><b>Thông báo đẩy (nếu bạn bật):</b> địa chỉ nhận thông báo của trình duyệt, loại thiết bị và tuỳ chọn thông báo.</li>
        <li><b>Kỹ thuật:</b> khi đăng ký chúng tôi lưu bản băm (không đọc ngược được) của địa chỉ IP trong tối đa 90 ngày để chống đăng ký hàng loạt. Nhà cung cấp hạ tầng có thể ghi nhật ký truy cập kỹ thuật.</li>
      </ul>
      <p>Hostexa <b>không</b> dùng Google Analytics, Facebook Pixel hay cookie quảng cáo. Ứng dụng dùng bộ nhớ trình duyệt (localStorage) để giữ đăng nhập và lưu tạm dữ liệu cơ sở trên máy bạn.</p>

      <h2>2. Mục đích sử dụng</h2>
      <ul>
        <li>Tạo và vận hành tài khoản, đồng bộ dữ liệu cơ sở giữa các thiết bị và giữa các tài khoản của cơ sở.</li>
        <li>Hiển thị lịch, thẻ dọn phòng, task, tài chính; gửi nhắc việc và thông báo trả/nhận phòng khi bạn bật.</li>
        <li>Quản lý gói dịch vụ, gia hạn, hỗ trợ khách hàng.</li>
        <li>Bảo mật hệ thống, chống lạm dụng.</li>
      </ul>
      <p>Chúng tôi không bán dữ liệu cá nhân và không dùng dữ liệu của bạn để quảng cáo cho bên thứ ba.</p>

      <h2>3. Dữ liệu khách lưu trú do chủ cơ sở nhập</h2>
      <p>Tên, số điện thoại, ghi chú của khách lưu trú là dữ liệu cá nhân của người khác. <b>Chủ cơ sở quyết định mục đích và cách dùng</b> dữ liệu này, và chịu trách nhiệm có căn cứ hợp pháp để thu thập, ví dụ thông báo cho khách. Hostexa chỉ xử lý dữ liệu đó theo hướng dẫn của chủ cơ sở để cung cấp phần mềm, không dùng cho mục đích riêng. Nhân viên dọn phòng không nhìn thấy tên khách, số điện thoại hay nguồn đặt phòng.</p>

      <h2>4. Chia sẻ và bên nhận dữ liệu</h2>
      <ul>
        <li><b>Vercel Inc.</b> (Hoa Kỳ): lưu trữ ứng dụng và cơ sở dữ liệu (Vercel Blob), chạy máy chủ.</li>
        <li><b>Dịch vụ thông báo đẩy của trình duyệt</b> (Google, Apple, Mozilla…): chỉ khi bạn bật thông báo, để chuyển thông báo tới thiết bị.</li>
        <li><b>Apify</b> (Cộng hoà Séc): chỉ với cơ sở dùng tính năng lấy giá tự động, chỉ gửi mã/đường dẫn phòng trên sàn, không gửi dữ liệu khách.</li>
        <li>Cơ quan nhà nước có thẩm quyền khi có yêu cầu hợp pháp.</li>
      </ul>
      <p>Như vậy dữ liệu của bạn được xử lý và lưu trên hệ thống đặt ở nước ngoài (chuyển dữ liệu xuyên biên giới). Chúng tôi chỉ dùng các nhà cung cấp trên cho mục đích vận hành dịch vụ.</p>

      <h2>5. Thời gian lưu trữ</h2>
      <p>Dữ liệu được lưu trong thời gian tài khoản còn tồn tại. Khi bạn xoá tài khoản, dữ liệu bị xoá như mục 7. Bản lưu bạn tự xuất ra file (nút "Xuất dữ liệu") nằm trên thiết bị của bạn, Hostexa không quản lý được.</p>

      <h2>6. Quyền của bạn</h2>
      <p>Bạn có quyền được biết, đồng ý hoặc rút lại đồng ý, xem, chỉnh sửa, xin cung cấp bản sao, hạn chế hoặc phản đối xử lý, xoá dữ liệu, khiếu nại và yêu cầu bồi thường theo quy định. Cách thực hiện:</p>
      <ul>
        <li><b>Xem, sửa:</b> trực tiếp trong ứng dụng.</li>
        <li><b>Bản sao dữ liệu:</b> nút "Xuất dữ liệu" ở màn Cơ sở (dành cho quản trị cơ sở).</li>
        <li><b>Xoá:</b> Cơ sở → Tài khoản → "Xoá tài khoản". Có thể rút lại đồng ý bằng cách xoá tài khoản.</li>
        <li><b>Yêu cầu khác</b> (hạn chế, phản đối, khiếu nại…): liên hệ theo thông tin cuối trang. Chúng tôi phản hồi trong 2 ngày làm việc và xử lý trong thời hạn theo Nghị định 356/2025/NĐ-CP.</li>
      </ul>

      <h2>7. Xoá tài khoản và dữ liệu</h2>
      <p>Khi quản trị duy nhất của một cơ sở xoá tài khoản, <b>toàn bộ cơ sở bị xoá vĩnh viễn</b>: lịch đặt phòng, thẻ dọn phòng, task, dữ liệu tài chính, mọi tài khoản nhân viên của cơ sở, thiết bị nhận thông báo và số điện thoại trong sổ chống đăng ký hàng loạt. Việc này không khôi phục được. Nhân viên xoá tài khoản chỉ mất tài khoản của chính mình; dữ liệu cơ sở vẫn giữ nguyên.</p>

      <h2>8. Bảo mật</h2>
      <p>Mật khẩu được băm bằng thuật toán scrypt; kết nối dùng HTTPS; phân quyền theo vai trò và địa điểm được lọc ngay ở máy chủ; dữ liệu tài chính chỉ quản trị cơ sở xem được; đăng nhập sai nhiều lần bị khoá tạm thời. Không có hệ thống nào an toàn tuyệt đối. Nếu xảy ra sự cố ảnh hưởng đến dữ liệu của bạn, chúng tôi sẽ thông báo cho bạn và cơ quan có thẩm quyền theo quy định.</p>

      <h2>9. Trẻ em</h2>
      <p>Hostexa dành cho người kinh doanh lưu trú, không hướng tới người dưới 18 tuổi.</p>

      <h2>10. Thay đổi chính sách</h2>
      <p>Khi nội dung thay đổi, chúng tôi cập nhật ngày áp dụng ở đầu trang và thông báo trong ứng dụng nếu thay đổi quan trọng.</p>

      <h2>11. Liên hệ</h2>
      <Contact />
    </>
  );
}

function Terms() {
  return (
    <>
      <h1>Điều khoản sử dụng</h1>
      <p className="muted">Áp dụng từ {POLICY_DATE} · Hostexa (hostexa.vercel.app)</p>
      <p>Khi tạo tài khoản hoặc sử dụng Hostexa, bạn đồng ý với các điều khoản dưới đây và với <a href="/chinh-sach-bao-mat">Chính sách bảo mật</a>.</p>

      <h2>1. Dịch vụ</h2>
      <p>Hostexa là phần mềm trên web giúp quản lý lịch đặt phòng (đồng bộ iCal với các sàn), dọn phòng, task, giá và tài chính cho cơ sở lưu trú. Tính năng thay đổi theo gói dịch vụ. Hostexa là công cụ hỗ trợ, không thay thế sổ sách kế toán, hợp đồng với khách hay nghĩa vụ pháp lý của chủ cơ sở.</p>

      <h2>2. Tài khoản</h2>
      <ul>
        <li>Bạn cung cấp thông tin đúng, tự bảo mật mật khẩu và chịu trách nhiệm về mọi hoạt động trong tài khoản.</li>
        <li>Quản trị cơ sở có thể tạo tài khoản nhân viên, dọn phòng và giao địa điểm cho họ; quản trị chịu trách nhiệm về việc phân quyền đó.</li>
        <li>Không dùng Hostexa để vi phạm pháp luật, xâm phạm quyền của người khác, dò quét hay làm gián đoạn hệ thống.</li>
      </ul>

      <h2>3. Dữ liệu của bạn</h2>
      <p>Dữ liệu bạn nhập thuộc về bạn. Bạn cấp cho Hostexa quyền lưu trữ và xử lý dữ liệu đó chỉ để cung cấp dịch vụ. Với dữ liệu cá nhân của khách lưu trú, bạn tự bảo đảm có căn cứ hợp pháp để thu thập và sử dụng (xem Chính sách bảo mật, mục 3). Bạn nên xuất dữ liệu sao lưu định kỳ.</p>

      <h2>4. Dùng thử và gói trả phí</h2>
      <ul>
        <li>Dùng thử miễn phí 14 ngày, giới hạn số phòng và địa điểm hiển thị khi đăng ký, không cần thẻ thanh toán.</li>
        <li>Gói trả phí tính theo bảng giá hiển thị trong ứng dụng (Cơ sở → Chọn gói), thời hạn 1, 3 hoặc 6 tháng. Giá chưa gồm VAT nếu không ghi khác.</li>
        <li>Thanh toán bằng chuyển khoản theo hướng dẫn qua Zalo hỗ trợ; gói được kích hoạt sau khi nhận được thanh toán.</li>
        <li>Hết hạn dùng thử hoặc gói, tài khoản chuyển sang chế độ chỉ xem; dữ liệu vẫn được giữ cho tới khi bạn xoá tài khoản.</li>
        <li>Huỷ gói, hoàn tiền hoặc điều chỉnh: liên hệ hỗ trợ trong thời hạn gói, chúng tôi xem xét và phản hồi từng trường hợp bằng văn bản (tin nhắn) theo quy định về bảo vệ quyền lợi người tiêu dùng.</li>
      </ul>

      <h2>5. Giá và dữ liệu từ bên thứ ba</h2>
      <p>Lịch, giá hay dữ liệu lấy từ các sàn (Airbnb, Booking.com, Agoda…) có thể chậm, thiếu hoặc sai khác với sàn. Bạn cần đối chiếu trước khi ra quyết định. Hostexa không chịu trách nhiệm với thiệt hại do dữ liệu từ bên thứ ba.</p>

      <h2>6. Hoạt động liên tục và giới hạn trách nhiệm</h2>
      <p>Chúng tôi cố gắng giữ dịch vụ hoạt động ổn định nhưng không cam kết không gián đoạn. Trong phạm vi pháp luật cho phép, trách nhiệm của Hostexa đối với một khiếu nại không vượt quá số tiền bạn đã trả cho gói trong thời hạn đang dùng. Điều khoản này không loại trừ các quyền mà pháp luật bảo vệ người tiêu dùng đã bảo đảm cho bạn.</p>

      <h2>7. Tạm khoá và chấm dứt</h2>
      <p>Chúng tôi có thể tạm khoá tài khoản vi phạm điều khoản và sẽ thông báo lý do. Bạn có thể xoá tài khoản bất cứ lúc nào (Cơ sở → Tài khoản → Xoá tài khoản); dữ liệu bị xoá theo Chính sách bảo mật, mục 7.</p>

      <h2>8. Thay đổi điều khoản và luật áp dụng</h2>
      <p>Khi điều khoản thay đổi, chúng tôi cập nhật ngày áp dụng và thông báo trong ứng dụng nếu thay đổi quan trọng; tiếp tục dùng sau khi thông báo nghĩa là bạn chấp nhận. Điều khoản chịu sự điều chỉnh của pháp luật Việt Nam. Tranh chấp được ưu tiên giải quyết qua thương lượng; không đạt thì giải quyết tại Toà án có thẩm quyền ở Việt Nam.</p>

      <h2>9. Khiếu nại và liên hệ</h2>
      <p>Mọi phản ánh, khiếu nại gửi qua kênh dưới đây; chúng tôi xác nhận đã tiếp nhận trong 3 ngày làm việc.</p>
      <Contact />
    </>
  );
}

/** Trang Chính sách bảo mật / Điều khoản: công khai, không cần đăng nhập */
export default function Legal({ page }) {
  useEffect(() => { document.getElementById('intro')?.remove(); document.title = page === 'terms' ? 'Điều khoản sử dụng – Hostexa' : 'Chính sách bảo mật – Hostexa'; }, [page]);
  return (
    <div className="legal">
      <header className="legal-head">
        <a className="legal-back" href="/"><ChevronLeft size={18} /> Quay lại Hostexa</a>
        <Logo size={28} />
      </header>
      <article className="legal-body">{page === 'terms' ? <Terms /> : <Privacy />}</article>
      <nav className="legal-foot">
        <a href="/chinh-sach-bao-mat" aria-current={page === 'privacy' ? 'page' : undefined}>Chính sách bảo mật</a>
        <a href="/dieu-khoan" aria-current={page === 'terms' ? 'page' : undefined}>Điều khoản sử dụng</a>
      </nav>
    </div>
  );
}

/** Link nhỏ tới hai trang, dùng ở màn đăng nhập và cuối trang Cơ sở */
export function LegalLinks({ newTab }) {
  const t = newTab ? { target: '_blank', rel: 'noopener' } : {};
  return (
    <p className="legal-links">
      <a href="/dieu-khoan" {...t}>Điều khoản sử dụng</a> · <a href="/chinh-sach-bao-mat" {...t}>Chính sách bảo mật</a>
    </p>
  );
}
