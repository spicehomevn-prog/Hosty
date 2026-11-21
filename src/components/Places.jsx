import { useRef, useState } from 'react';
import { Building2, Pencil, RefreshCw, CheckCircle2, AlertCircle, Download, Upload, MapPin, UserRound, Link2 } from '../lib/icons.jsx';
import { useStore } from '../lib/store.jsx';
import { timeAgo } from '../lib/dates.js';
import { toast } from './ui.jsx';
import { Logo } from './Logo.jsx';
import { AccountCard } from './Account.jsx';
import { ExportLinksSheet } from './ExportLinks.jsx';
import { can } from '../lib/perm.js';

const TONES = ['blue', 'violet', 'yellow', 'pink'];

export default function Places({ api }) {
  const { state, dispatch, sync, syncing, role, cloud } = useStore();
  const [exportOpen, setExportOpen] = useState(false);
  const canSetup = can(role, 'setup');
  const fileRef = useRef(null);

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
      if (!confirm(cloud.enabled ? 'Thay toàn bộ dữ liệu của cơ sở bằng file này? Dữ liệu mới sẽ được đồng bộ cho mọi tài khoản của cơ sở.' : 'Thay toàn bộ dữ liệu bằng file này?')) return;
      dispatch({ type: 'REPLACE', state: data });
      toast('Đã nhập dữ liệu');
    } catch { toast('File không hợp lệ'); }
    e.target.value = '';
  };

  return (
    <div className="places">
      <header className="page-head rise">
        <div><h1>Cơ sở</h1><p className="sub">{canSetup ? 'Tài khoản, địa điểm, phòng & lịch đồng bộ' : 'Tài khoản & cài đặt'}</p></div>
        {canSetup && <button className="icon-btn" onClick={api.editSetup} aria-label="Chỉnh sửa thiết lập"><Pencil size={18} /></button>}
      </header>

      <h2 className="section-title"><UserRound size={18} /> Tài khoản</h2>
      <AccountCard />

      {canSetup && <>
      <h2 className="section-title">Địa điểm & phòng</h2>

      <div className="loc-list stagger">
        {state.locations.map((loc, i) => {
          const cals = state.calendars.filter((c) => loc.rooms.some((r) => r.id === c.roomId));
          return (
            <details key={loc.id} className={`loc-card tone-${TONES[i % 4]}`}>
              <summary>
                <span className="emoji-box lg"><Building2 size={26} /></span>
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
          <RefreshCw size={16} className={syncing ? 'spin' : ''} /> Tải lại lịch iCal
        </button>
        <button className="btn ghost" onClick={api.editSetup}><Pencil size={16} /> Sửa phòng & lịch</button>
      </div>
      <p className="tiny muted">Lịch iCal từ các sàn tự tải lại mỗi 30 phút khi app đang mở. Lần cuối: {timeAgo(state.lastSync)}.</p>

      <h2 className="section-title">Đồng bộ ngược lên sàn</h2>
      <div className="xl-card">
        <span className="xl-ico"><Upload size={22} /></span>
        <div>
          <b>Chặn ngày trên Airbnb, Booking… khi có khách đặt trực tiếp</b>
          <small>Lấy link lịch xuất của từng phòng và dán vào mục "Nhập lịch" của sàn. Link gồm khách đặt trực tiếp và khách từ các sàn khác.</small>
          {cloud.enabled
            ? <button className="btn primary" onClick={() => setExportOpen(true)}><Link2 size={16} /> Lấy link xuất lịch</button>
            : <small className="xl-note">Cần đăng nhập tài khoản (chế độ xem thử không có máy chủ).</small>}
        </div>
      </div>
      {exportOpen && <ExportLinksSheet onClose={() => setExportOpen(false)} />}
      </>}

      {can(role, 'backup') && <>
        <h2 className="section-title">Sao lưu</h2>
        <p className="tiny muted">Xuất dữ liệu cơ sở ra file để lưu trữ riêng, hoặc khôi phục từ file đã xuất.</p>
        <div className="data-actions">
          <button className="btn ghost" onClick={exportData}><Download size={16} /> Xuất dữ liệu</button>
          <button className="btn ghost" onClick={() => fileRef.current?.click()}><Upload size={16} /> Nhập dữ liệu</button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={importData} />
        </div>
      </>}
      <footer className="brand-foot"><Logo size={28} /><span>Lịch đặt phòng & dọn phòng cho khách sạn, homestay</span></footer>
    </div>
  );
}
