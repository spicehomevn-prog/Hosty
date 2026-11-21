import { useState } from 'react';
import { Trash2, LogIn, LogOut, Moon, Ban } from '../lib/icons.jsx';
import { useStore, uid, PLATFORMS, platformColor } from '../lib/store.jsx';
import { roomIndex } from '../lib/derive.js';
import { todayKey, addDays, diffDays, longDate } from '../lib/dates.js';
import { Sheet, Field, toast } from './ui.jsx';
import { can } from '../lib/perm.js';

export function BookingSheet({ mode, data, onClose }) {
  if (mode === 'new' || (mode === 'edit')) return <ManualForm data={data} onClose={onClose} />;
  return <BookingDetail b={data} onClose={onClose} />;
}

function BookingDetail({ b, onClose }) {
  const { state, dispatch, role } = useStore();
  const [edit, setEdit] = useState(false);
  const canEdit = can(role, 'booking');
  const info = roomIndex(state)[b.roomId];
  if (edit) return <ManualForm data={state.manual.find((m) => m.id === b.id) || b} onClose={onClose} />;
  const nights = diffDays(b.start, b.end);
  return (
    <Sheet open onClose={onClose} title="Chi tiết đặt phòng"
      footer={!canEdit ? null : b.source === 'manual' ? (
        <>
          <button className="icon-btn danger" onClick={() => { dispatch({ type: 'DELETE_MANUAL', id: b.id }); toast('Đã xoá đặt phòng'); onClose(); }} aria-label="Xoá"><Trash2 size={18} /></button>
          <button className="btn primary block" onClick={() => setEdit(true)}>Sửa đặt phòng</button>
        </>
      ) : (
        <button className="btn ghost block" onClick={() => { dispatch({ type: 'SET_OVERRIDE', id: b.id, patch: { blocked: !b.blocked } }); onClose(); }}>
          <Ban size={16} /> {b.blocked ? 'Đây là đặt phòng thật (cần dọn)' : 'Đánh dấu là khoá phòng (không dọn)'}
        </button>
      )}>
      <div className="bk-head" style={{ '--bc': b.color }}>
        <span className="bk-platform">{b.blocked ? 'Khoá phòng' : b.platform}</span>
        <h3>{info?.room.name}</h3>
        <p>{info?.location.name}{info?.location.address ? ` · ${info.location.address}` : ''}</p>
      </div>
      <div className="bk-grid">
        <div><LogIn size={16} /><span>Nhận phòng</span><b>{longDate(b.start)}</b><em>{b.checkIn}</em></div>
        <div><LogOut size={16} /><span>Trả phòng</span><b>{longDate(b.end)}</b><em>{b.checkOut}</em></div>
        <div><Moon size={16} /><span>Số đêm</span><b>{nights} đêm</b></div>
      </div>
      {(b.summary || b.description) && (
        <div className="bk-desc">
          {b.summary && <b>{b.summary}</b>}
          {b.description && <pre>{b.description}</pre>}
        </div>
      )}
    </Sheet>
  );
}

function ManualForm({ data, onClose }) {
  const { state, dispatch } = useStore();
  const firstRoom = state.locations[0]?.rooms[0]?.id || '';
  const t = todayKey();
  const [f, setF] = useState({
    roomId: firstRoom, platform: 'Trực tiếp', guest: '', start: t, end: addDays(t, 1), checkIn: '14:00', checkOut: '12:00', note: '',
    ...data,
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const valid = f.roomId && f.start && f.end && f.end > f.start;
  const save = () => {
    if (!valid) return;
    const { summary, description, blocked, source, color, calendarId, ...clean } = f; // eslint-disable-line no-unused-vars
    dispatch({ type: 'SAVE_MANUAL', booking: { ...clean, id: f.id || uid() } });
    toast('Đã lưu đặt phòng');
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title={f.id ? 'Sửa đặt phòng' : 'Thêm đặt phòng'}
      footer={<button className="btn primary block" onClick={save} disabled={!valid}>Lưu đặt phòng</button>}>
      <Field label="Phòng">
        <select className="input" value={f.roomId} onChange={set('roomId')}>
          {state.locations.map((l) => (
            <optgroup key={l.id} label={l.name}>{l.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</optgroup>
          ))}
        </select>
      </Field>
      <Field label="Tên khách / SĐT"><input className="input" value={f.guest} onChange={set('guest')} placeholder="VD: Anh Minh – 0909 123 456" /></Field>
      <Field label="Nguồn">
        <div className="chip-row">
          {PLATFORMS.map((p) => (
            <button key={p.name} type="button" className={`mini-chip ${f.platform === p.name ? 'on' : ''}`} style={{ '--pc': platformColor(p.name) }} onClick={() => setF({ ...f, platform: p.name })}>{p.name}</button>
          ))}
        </div>
      </Field>
      <div className="grid2">
        <Field label="Ngày nhận"><input type="date" className="input" value={f.start} onChange={set('start')} /></Field>
        <Field label="Ngày trả"><input type="date" className="input" value={f.end} min={addDays(f.start, 1)} onChange={set('end')} /></Field>
        <Field label="Giờ nhận"><input type="time" className="input" value={f.checkIn} onChange={set('checkIn')} /></Field>
        <Field label="Giờ trả"><input type="time" className="input" value={f.checkOut} onChange={set('checkOut')} /></Field>
      </div>
      {f.end <= f.start && <p className="form-error">Ngày trả phải sau ngày nhận.</p>}
      <Field label="Ghi chú"><textarea className="input" rows={2} value={f.note} onChange={set('note')} placeholder="Yêu cầu đặc biệt, tiền cọc…" /></Field>
    </Sheet>
  );
}
