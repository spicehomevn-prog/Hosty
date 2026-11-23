import { useState } from 'react';
import { Bell, CalendarPlus, CheckCircle2, Loader2, Clock } from '../lib/icons.jsx';
import { useNotify, isIOS, isAndroid, isStandalone, pushSupported } from '../lib/notify.js';
import { useSession } from '../lib/session.jsx';
import { icsUrl, googleUrl } from '../lib/tasks.js';
import { Sheet } from './ui.jsx';

const Spin = ({ on }) => (on ? <Loader2 size={14} className="spin" /> : null);

const PREFS = [
  { k: 'daily', label: 'Tổng quan lúc 8:00', hint: 'Lượt trả phòng, nhận phòng, khoản phải thu hôm nay' },
  { k: 'checkout', label: 'Trả phòng', hint: 'Báo trước giờ trả phòng 1 tiếng, từng phòng' },
  { k: 'checkin', label: 'Nhận phòng', hint: 'Báo trước giờ nhận phòng 1 tiếng, từng phòng' },
  { k: 'task', label: 'Nhắc task', hint: 'Theo giờ và "Nhắc trước" đặt trong từng task' },
];

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
  if (!pushSupported() && isIOS() && !isStandalone()) pushNote = 'iPhone chỉ nhận thông báo khi mở Hostexa từ biểu tượng ngoài Màn hình chính: bấm nút Chia sẻ trong Safari > "Thêm vào MH chính", rồi mở từ biểu tượng đó.';
  else if (!pushSupported()) pushNote = isIOS() ? 'Cần iOS 16.4 trở lên để nhận thông báo.' : 'Trình duyệt này không hỗ trợ thông báo. Dùng Chrome hoặc Safari bản mới.';
  else if (Notification.permission === 'denied') pushNote = 'Máy đang chặn thông báo của Hostexa. Mở Cài đặt của máy > Thông báo > Hostexa (hoặc cài đặt trang trong trình duyệt) để cho phép.';

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
              <button className="btn tiny danger" onClick={n.disablePush} disabled={!!busy}><Spin on={busy === 'push'} /> Tắt</button>
            </div>
          </>
        ) : (
          <button className="btn primary block" onClick={n.enablePush} disabled={!!busy}><Spin on={busy === 'push'} /> Bật thông báo</button>
        )}
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
        {owner && info?.push && !info.push.cron && <p className="rm-note">Chủ hệ thống: máy chủ chưa có CRON_SECRET nên chưa gửi được lời nhắc theo giờ (xem README, mục Nhắc hẹn).</p>}
      </div>
      {err && <p className="form-error">{err}</p>}
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
