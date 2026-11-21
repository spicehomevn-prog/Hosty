import { useEffect, useRef } from 'react';
import { Pencil, RefreshCw, CheckCircle2, AlertCircle, Download, Upload, RotateCcw, MapPin, Type } from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import { FONTS, ensureFont } from '../lib/fonts.js';
import { timeAgo } from '../lib/dates.js';
import { toast } from './ui.jsx';
import { Logo } from './Logo.jsx';

const TONES = ['blue', 'violet', 'yellow', 'pink'];

export default function Places({ api }) {
  const { state, dispatch, sync, syncing } = useStore();
  const fileRef = useRef(null);
  useEffect(() => { FONTS.forEach((f) => ensureFont(f.id)); }, []);

  const exportData = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `hosty-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importData = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.locations)) throw new Error();
      dispatch({ type: 'REPLACE', state: data });
      toast('Đã nhập dữ liệu');
    } catch { toast('File không hợp lệ'); }
    e.target.value = '';
  };

  return (
    <div className="places">
      <header className="page-head">
        <div><h1>Cơ sở</h1><p className="sub">Địa điểm, phòng & lịch đồng bộ</p></div>
        <button className="icon-btn" onClick={api.editSetup} aria-label="Chỉnh sửa thiết lập"><Pencil size={18} /></button>
      </header>

      <div className="loc-list">
        {state.locations.map((loc, i) => {
          const cals = state.calendars.filter((c) => loc.rooms.some((r) => r.id === c.roomId));
          return (
            <details key={loc.id} className={`loc-card tone-${TONES[i % 4]}`}>
              <summary>
                <span className="emoji-box lg">{loc.emoji}</span>
                <span className="loc-info">
                  <b>{loc.name}</b>
                  <small>{loc.rooms.length} phòng · {cals.length} lịch</small>
                </span>
              </summary>
              {loc.address && <p className="loc-addr"><MapPin size={14} />{loc.address}</p>}
              <div className="room-list">
                {loc.rooms.map((r) => {
                  const rc = state.calendars.filter((c) => c.roomId === r.id);
                  return (
                    <div key={r.id} className="room-item">
                      <b>{r.name}</b>
                      {rc.length === 0 && <small className="muted">Chưa có lịch iCal</small>}
                      {rc.map((c) => {
                        const si = state.syncInfo[c.id];
                        return (
                          <div key={c.id} className={`cal-status ${si && !si.ok ? 'bad' : ''}`}>
                            {si && !si.ok ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />}
                            <span>{c.platform}</span>
                            <em>{si ? (si.ok ? `${si.count} sự kiện · ${timeAgo(si.at)}` : si.error) : 'chưa đồng bộ'}</em>
                            <small>Nhận {c.checkIn} · Trả {c.checkOut}</small>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </details>
          );
        })}
      </div>

      <div className="row gap8 wrap">
        <button className="btn primary" onClick={async () => { const r = await sync(); toast(r.length ? `Đã đồng bộ ${r.filter((x) => x.ok).length}/${r.length} lịch` : 'Chưa có link iCal nào'); }} disabled={syncing}>
          <RefreshCw size={16} className={syncing ? 'spin' : ''} /> Đồng bộ ngay
        </button>
        <button className="btn ghost" onClick={api.editSetup}><Pencil size={16} /> Sửa phòng & lịch</button>
      </div>
      <p className="tiny muted">Tự động đồng bộ mỗi 30 phút khi app đang mở. Lần cuối: {timeAgo(state.lastSync)}.</p>

      <h2 className="section-title"><Type size={18} /> Font chữ</h2>
      <p className="tiny muted">Các font không chân từ Google Fonts, hỗ trợ đầy đủ tiếng Việt.</p>
      <div className="font-grid">
        {FONTS.map((f) => (
          <button key={f.id} className={`font-card ${state.settings.font === f.id ? 'on' : ''}`} style={{ fontFamily: `'${f.id}', sans-serif` }} onClick={() => dispatch({ type: 'SETTINGS', patch: { font: f.id } })}>
            <span className="font-tag">{f.tag}</span>
            <b className="font-sample">Phòng đẹp, khách vui</b>
            <span className="font-name">{f.id}</span>
            <small>{f.note}</small>
          </button>
        ))}
      </div>

      <h2 className="section-title">Dữ liệu</h2>
      <p className="tiny muted">Dữ liệu được lưu trên trình duyệt của thiết bị này. Xuất file để sao lưu hoặc chuyển sang máy khác.</p>
      <div className="data-actions">
        <button className="btn ghost" onClick={exportData}><Download size={16} /> Xuất dữ liệu</button>
        <button className="btn ghost" onClick={() => fileRef.current?.click()}><Upload size={16} /> Nhập dữ liệu</button>
        <input ref={fileRef} type="file" accept="application/json" hidden onChange={importData} />
        <button className="btn ghost danger" onClick={() => { if (confirm('Xoá toàn bộ dữ liệu và thiết lập lại từ đầu?')) dispatch({ type: 'RESET' }); }}><RotateCcw size={16} /> Thiết lập lại</button>
      </div>
      <footer className="brand-foot"><Logo size={28} /><span>Lịch đặt phòng & dọn phòng cho khách sạn, homestay</span></footer>
    </div>
  );
}
