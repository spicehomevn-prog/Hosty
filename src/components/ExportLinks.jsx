import { useEffect, useState } from 'react';
import { Copy, Loader2, MapPin, AlertCircle } from '../lib/icons.jsx';
import { useSession } from '../lib/session.jsx';
import { useStore, platformColor } from '../lib/store.jsx';
import { copyText } from '../lib/derive.js';
import { Sheet, toast } from './ui.jsx';

const GUIDE = [
  { name: 'Airbnb', steps: 'Lịch → chọn chỗ ở → Tình trạng còn phòng → Kết nối lịch → Nhập lịch → dán link, đặt tên "Hostexa".' },
  { name: 'Booking.com', steps: 'Extranet → Giá & Tình trạng phòng → Đồng bộ lịch → chọn phòng → Nhập lịch → dán link.' },
  { name: 'Agoda', steps: 'YCS → Lịch → Đồng bộ lịch iCal → Nhập lịch → dán link.' },
  { name: 'Traveloka', steps: 'Tera → Phòng & Giá → Đồng bộ lịch (iCal) → Nhập lịch → dán link.' },
];

function LinkRow({ label, hint, url, color }) {
  return (
    <div className="xl-row" style={{ '--pc': color }}>
      <div className="xl-main">
        <b><span className="pdot" style={{ background: color }} />{label}</b>
        <small>{hint}</small>
        <code className="xl-url">{url}</code>
      </div>
      <button className="btn tiny" onClick={async () => toast((await copyText(url)) ? 'Đã copy link' : 'Không copy được')}>
        <Copy size={14} /> Copy
      </button>
    </div>
  );
}

/** Link xuất lịch iCal từ Hostexa để dán vào mục "Nhập lịch" của từng sàn */
export function ExportLinksSheet({ onClose }) {
  const { call, workspace } = useSession();
  const { cloud } = useStore();
  const [links, setLinks] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      try {
        if (cloud.dirty) await cloud.syncNow(); // đảm bảo đặt phòng trực tiếp mới nhất đã lên máy chủ
        const r = await call(`/api/data?ws=${workspace.id}&links=1`);
        setLinks(r.links);
      } catch (e) { setErr(e.message); }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  let lastLoc = null;
  return (
    <Sheet open onClose={onClose} title="Đồng bộ ngược lên sàn">
      <p className="tiny muted">
        Dán link của từng phòng vào mục <b>Nhập lịch</b> trên sàn. Sàn sẽ tự chặn những ngày phòng đã có khách
        <b> đặt trực tiếp</b> hoặc khách từ <b>sàn khác</b>. Mỗi sàn dùng đúng link mang tên sàn đó (link đã loại khách của chính sàn để không bị chặn vòng).
      </p>
      <div className="xl-warn"><AlertCircle size={16} /><span>Sàn tự đọc lại lịch theo chu kỳ của sàn (thường vài giờ một lần). Khách đặt trực tiếp sát ngày nên chặn tay trên sàn cho chắc.</span></div>

      {err && <p className="form-error">{err}</p>}
      {!links && !err && <div className="empty-card"><Loader2 className="spin" size={20} /><p>Đang tạo link…</p></div>}
      {links && links.length === 0 && <p className="tiny muted">Cơ sở chưa có phòng nào.</p>}
      {links && links.map((r) => {
        const head = r.locationName !== lastLoc;
        lastLoc = r.locationName;
        return (
          <div key={r.roomId}>
            {head && <h4 className="xl-loc"><MapPin size={16} /> {r.locationName}</h4>}
            <section className="xl-room">
              <h5>{r.roomName}</h5>
              {r.calendars.map((c) => (
                <LinkRow key={c.id} label={`Dán vào ${c.platform}`} color={platformColor(c.platform)}
                  hint={`Gồm khách đặt trực tiếp + các sàn khác, trừ ${c.platform}`} url={c.url} />
              ))}
              <LinkRow label={r.calendars.length ? 'Sàn khác (chưa kết nối với Hostexa)' : 'Dán vào các sàn'} color="#7C5CE6"
                hint="Gồm mọi đặt phòng của phòng này" url={r.all} />
            </section>
          </div>
        );
      })}

      <details className="help">
        <summary>Dán link vào sàn ở đâu?</summary>
        <ul>{GUIDE.map((g) => <li key={g.name}><b>{g.name}:</b> {g.steps}</li>)}</ul>
      </details>
    </Sheet>
  );
}
