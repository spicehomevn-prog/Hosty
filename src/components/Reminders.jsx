import { useState } from 'react';
import { Bell, CalendarPlus, CheckCircle2, Loader2, Clock } from '../lib/icons.jsx';
import { useNotify, isIOS, isAndroid, isStandalone, isInApp, pushSupported, browserName } from '../lib/notify.js';
import { useSession } from '../lib/session.jsx';
import { icsUrl, googleUrl } from '../lib/tasks.js';
import { Sheet } from './ui.jsx';

// Android: trang web / biểu tượng ngoài màn hình chính nhận thông báo QUA TRÌNH DUYỆT đã mở / tạo ra nó
// (Chrome, Samsung Internet…) – không có app Hostexa riêng trong Cài đặt điện thoại.
const BROWSER = browserName();
const OTHER_PERM = 'Máy đang chặn thông báo của Hostexa. Mở Cài đặt của máy → Thông báo → Hostexa (hoặc cài đặt trang trong trình duyệt) để cho phép.';

/** Cách dự phòng chắc chắn trên Android: dùng Chrome và cài lại biểu tượng từ Chrome */
const ChromeFallback = () => (
  <p><b>Cách chắc chắn nhất:</b> mở <a href="https://hostexa.vercel.app">hostexa.vercel.app</a> bằng <b>Chrome</b> → ⋮ → <b>Thêm vào màn hình chính</b> (hoặc <b>Cài đặt ứng dụng</b>), xoá biểu tượng Hostexa cũ, rồi mở biểu tượng mới và bật thông báo.</p>
);

/** Các bước mở chặn thông báo cho đúng trình duyệt + tên miền đang mở */
function DeniedHelp() {
  const host = location.host;
  if (!isAndroid()) return <p className="rm-note">{OTHER_PERM}</p>;
  const steps = BROWSER === 'Samsung Internet' ? (
    <ol>
      <li>Mở <b>Samsung Internet</b> (trình duyệt màu tím của Samsung), vào địa chỉ <b>{host}</b>.</li>
      <li>Bấm <b>≡</b> (góc dưới phải) → <b>Cài đặt</b> → <b>Trang web và tải xuống</b> → <b>Thông báo</b> (máy cũ: <b>Quyền trang web</b> → <b>Thông báo</b>): bật <b>Cho phép thông báo</b>; nếu {host} nằm trong mục <b>Bị chặn</b> thì bấm vào → <b>Xoá</b> / <b>Cho phép</b>.</li>
      <li>Cài đặt điện thoại → <b>Ứng dụng</b> → <b>Samsung Internet</b> → <b>Thông báo</b> → bật.</li>
      <li>Quay lại Hostexa, bấm <b>Bật thông báo</b> → chọn <b>Cho phép</b> khi được hỏi.</li>
    </ol>
  ) : BROWSER === 'Chrome' ? (
    <ol>
      <li>Mở <b>Chrome</b>, vào đúng địa chỉ <b>{host}</b>.</li>
      <li>Bấm biểu tượng <b>ⓘ / ổ khoá</b> cạnh thanh địa chỉ → <b>Quyền</b> (hoặc <b>Cài đặt trang web</b>) → <b>Thông báo</b> → <b>Cho phép</b>. Không thấy mục Thông báo thì bấm <b>Đặt lại quyền</b>.</li>
      <li>Chrome → ⋮ → Cài đặt → Cài đặt trang web → <b>Thông báo</b>: công tắc trên cùng phải <b>bật</b>, và {host} không nằm trong mục <b>Bị chặn</b>.</li>
      <li>Cài đặt điện thoại → Ứng dụng → <b>Chrome</b> → Thông báo → bật.</li>
      <li>Quay lại Hostexa, bấm <b>Bật thông báo</b> → chọn <b>Cho phép</b> khi được hỏi.</li>
    </ol>
  ) : (
    <ol>
      <li>Mở <b>{BROWSER}</b>, vào địa chỉ <b>{host}</b>.</li>
      <li>Bấm biểu tượng <b>ổ khoá / ⓘ</b> cạnh thanh địa chỉ (hoặc Cài đặt của trình duyệt → Quyền trang web) → <b>Thông báo</b> → <b>Cho phép</b>.</li>
      <li>Cài đặt điện thoại → Ứng dụng → <b>{BROWSER}</b> → Thông báo → bật.</li>
      <li>Quay lại Hostexa, bấm <b>Bật thông báo</b>.</li>
    </ol>
  );
  return (
    <div className="rm-note rm-steps">
      <b>{BROWSER} đang chặn thông báo của {host}</b>
      {BROWSER !== 'Chrome' && <p>Hostexa trên máy này đang chạy bằng <b>{BROWSER}</b>, nên chỉnh quyền trong Chrome sẽ không có tác dụng.</p>}
      {steps}
      <ChromeFallback />
      {host.startsWith('hosty-rose') && <p>Bạn đang mở bằng tên miền cũ. Nên mở <a href="https://hostexa.vercel.app">hostexa.vercel.app</a> và thêm lại biểu tượng ra màn hình chính.</p>}
    </div>
  );
}

/** Hướng dẫn theo bước bị kẹt khi bật thông báo */
function failHelp(step) {
  if (step === 'perm' || step === 'denied') return null; // DeniedHelp hiện riêng
  if (step === 'sub') {
    return isAndroid()
      ? `Kiểm tra: có mạng ổn định, Dịch vụ Google Play đang bật và đã cập nhật, tắt Tiết kiệm dữ liệu / Tiết kiệm pin cho ${BROWSER} (Cài đặt điện thoại → Ứng dụng → ${BROWSER} → Pin → Không hạn chế). Vẫn không được: mở hostexa.vercel.app bằng Chrome → ⋮ → Thêm vào màn hình chính, rồi bật thông báo trong biểu tượng mới.`
      : 'Kiểm tra mạng rồi thử lại. Vẫn không được: dùng Chrome / Safari bản mới.';
  }
  if (step === 'sw') return 'Đóng hẳn Hostexa (vuốt tắt khỏi danh sách app đang mở) rồi mở lại và thử lại.';
  return '';
}

const Spin = ({ on }) => (on ? <Loader2 size={14} className="spin" /> : null);

const PREFS = [
  { k: 'daily', label: 'Tổng quan lúc 8:00', hint: 'Lượt trả phòng, nhận phòng, khoản phải thu hôm nay' },
  { k: 'checkout', label: 'Trả phòng', hint: 'Báo trước giờ trả phòng 1 tiếng, từng phòng' },
  { k: 'checkin', label: 'Nhận phòng', hint: 'Báo trước giờ nhận phòng 1 tiếng, từng phòng' },
  { k: 'task', label: 'Nhắc task', hint: 'Theo giờ và "Nhắc trước" đặt trong từng task' },
];

const hm = (t) => new Date(t).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
const dmTs = (t) => new Date(t).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });

/** Tình trạng gửi của máy chủ (chủ hệ thống / admin): tổng quan hôm nay + lỗi gần nhất */
function RunStatus({ run }) {
  const d = run.daily;
  const nowVN = new Date(Date.now() + 7 * 3600e3).getUTCHours();
  let line;
  if (d?.sent) line = <span className="ok">Tổng quan hôm nay: đã gửi lúc {hm(d.at)} tới {d.sent} người{d.failed ? ` · ${d.failed} người lỗi` : ''}</span>;
  else if (d?.failed) line = <span className="bad">Tổng quan hôm nay chưa gửi được: {d.errors?.[0] || 'lỗi không rõ'}</span>;
  else if (nowVN < 8) line = <span>Tổng quan hôm nay: sẽ gửi lúc 8:00</span>;
  else line = <span className="bad">Tổng quan hôm nay: chưa gửi{run.at ? ` · lần gửi gần nhất ${dmTs(run.at)} ${hm(run.at)}` : ''}</span>;
  return (
    <div className="rm-run">
      {line}
      {run.lastError && <span className="bad">Lỗi gần nhất ({dmTs(run.lastError.at)} {hm(run.lastError.at)}): {run.lastError.text}</span>}
    </div>
  );
}

/** Thông báo đẩy (bật trên từng máy) + chọn loại thông báo muốn nhận */
export function RemindersPanel({ n }) {
  const s = useSession();
  const { info, err, busy, pushOn } = n;
  const owner = s.role === 'owner';

  if (n.demo) {
    return <p className="tiny muted">Chế độ xem thử không gửi nhắc hẹn. Đăng nhập tài khoản thật để bật thông báo.</p>;
  }
  if (!info && !err) return <p className="tiny muted"><Loader2 size={14} className="spin" /> Đang tải…</p>;

  let pushNote = null;
  if (isInApp()) pushNote = 'Trang đang mở bên trong Zalo / Facebook nên không nhận được thông báo. Bấm ⋮ (hoặc …) → "Mở bằng trình duyệt" / "Mở bằng Chrome", rồi bật thông báo ở đó.';
  else if (!pushSupported() && isIOS() && !isStandalone()) pushNote = 'iPhone chỉ nhận thông báo khi mở Hostexa từ biểu tượng ngoài Màn hình chính: bấm nút Chia sẻ trong Safari > "Thêm vào MH chính", rồi mở từ biểu tượng đó.';
  else if (!pushSupported()) pushNote = isIOS() ? 'Cần iOS 16.4 trở lên để nhận thông báo.' : 'Trình duyệt này không hỗ trợ thông báo. Dùng Chrome hoặc Safari bản mới.';

  return (
    <div className="rm-panel">
      <div className="rm-card">
        <div className="rm-head">
          <span className="rm-ico p"><Bell size={18} /></span>
          <div><b>Thông báo trên máy này</b><small>Hostexa tự gửi thông báo tới điện thoại / máy tính này. Bật riêng trên từng máy.</small></div>
        </div>
        {pushNote ? <p className="rm-note">{pushNote}</p> : pushOn ? (
          <>
            <p className="rm-state ok"><CheckCircle2 size={15} /><span>Đang bật trên máy này</span></p>
            <div className="row gap8 wrap">
              <button className="btn tiny" onClick={n.testPush} disabled={!!busy}><Spin on={busy === 'test'} /> Gửi thử</button>
              <button className="btn tiny" onClick={n.sendDaily} disabled={!!busy}><Spin on={busy === 'daily'} /> Gửi tổng quan ngay</button>
              <button className="btn tiny danger" onClick={n.disablePush} disabled={!!busy}><Spin on={busy === 'push'} /> Tắt</button>
            </div>
          </>
        ) : (
          <>
            <button className="btn primary block" onClick={n.enablePush} disabled={!!busy}><Spin on={busy === 'push'} /> Bật thông báo</button>
            {n.step && <p className="rm-step"><Loader2 size={14} className="spin" /> {n.step}</p>}
            {!n.step && (n.perm === 'denied' || n.failStep === 'denied' || n.failStep === 'perm') && <DeniedHelp />}
            {!err && n.perm === 'denied' && n.diag && <p className="rm-diag">{n.diag}</p>}
          </>
        )}
        {n.note && <p className="rm-note">{n.note}</p>}
        {pushOn && info?.push?.prefs && (
          <div className="rm-prefs">
            <small className="rm-prefs-h">Nhận những thông báo:</small>
            {PREFS.map((p) => (
              <label key={p.k} className="rm-pref">
                <span><b>{p.label}</b><small>{p.hint}</small></span>
                <input type="checkbox" className="switch" checked={info.push.prefs[p.k] !== false} onChange={(e) => n.setPref(p.k, e.target.checked)} />
              </label>
            ))}
          </div>
        )}
        {pushOn && info?.run && <RunStatus run={info.run} />}
        {owner && info?.push && !info.push.cron && <p className="rm-note">Chủ hệ thống: máy chủ chưa có CRON_SECRET nên chưa gửi được lời nhắc theo giờ (xem README, mục Nhắc hẹn).</p>}
      </div>
      {err && (
        <div className="rm-fail">
          <p className="form-error">{err}</p>
          {failHelp(n.failStep) && <p className="rm-note">{failHelp(n.failStep)}</p>}
          {n.diag && <p className="rm-diag">{n.diag}</p>}
        </div>
      )}
    </div>
  );
}

/** Thẻ "Nhắc hẹn" ở trang Cơ sở */
export function RemindersCard() {
  const n = useNotify();
  return <RemindersPanel n={n} />;
}

/** Khối nhắc hẹn trong form task */
export function TaskReminderBox({ f, roomName, summary }) {
  const n = useNotify();
  const [open, setOpen] = useState(false);
  const assigned = !!f.assignee;
  // iPhone mở từ biểu tượng: tệp .ics không mở được trong app -> chuyển sang Safari
  const ics = isIOS() && isStandalone() ? `x-safari-https://${location.host}${icsUrl(f, roomName)}` : icsUrl(f, roomName);
  return (
    <div className="remind-box">
      <b><Bell size={16} /> Nhắc hẹn</b>
      <small>{summary}</small>
      {!n.demo && (
        <div className="rm-mini">
          <span className={n.pushOn ? 'on' : ''}><Bell size={14} /> Thông báo máy này: {n.pushOn ? 'đang bật' : 'chưa bật'}</span>
          {assigned && <span className="muted">Task giao riêng: chỉ người được giao nhận nhắc.</span>}
        </div>
      )}
      <div className="row gap8 wrap">
        {!n.demo && !n.pushOn && <button type="button" className="btn ghost" onClick={() => setOpen(true)}><Bell size={16} /> Cài đặt nhắc hẹn</button>}
        <details className="rm-manual">
          <summary>Thêm tay vào lịch</summary>
          <div className="row gap8 wrap">
            {!isAndroid() && <a className="btn ghost" href={ics} target="_blank" rel="noopener"><Clock size={16} /> Lịch iPhone (.ics)</a>}
            <a className="btn ghost" href={googleUrl(f, roomName)} target="_blank" rel="noopener"><CalendarPlus size={16} /> Google Calendar</a>
          </div>
          <small className="muted">Thêm một lần, không tự cập nhật khi sửa task.</small>
        </details>
      </div>
      {open && (
        <Sheet open onClose={() => { setOpen(false); n.load(); }} title="Cài đặt nhắc hẹn">
          <RemindersPanel n={n} />
        </Sheet>
      )}
    </div>
  );
}
