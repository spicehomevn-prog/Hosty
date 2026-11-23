import { useState } from 'react';
import { Trash2, CalendarPlus, Clock } from '../lib/icons.jsx';
import { useStore, uid } from '../lib/store.jsx';
import { todayKey, dm } from '../lib/dates.js';
import { REPEATS, REMINDS, repeatLabel, icsUrl, googleUrl } from '../lib/tasks.js';
import { roomIndex } from '../lib/derive.js';
import { Sheet, Field } from './ui.jsx';
import { useMembers } from '../lib/members.js';

export const PRIORITIES = [
  { id: 'normal', label: 'Bình thường' },
  { id: 'important', label: 'Quan trọng' },
  { id: 'urgent', label: 'Gấp' },
];

export function TaskSheet({ task, onClose }) {
  const { state, dispatch } = useStore();
  const members = useMembers().filter((m) => m.role === 'member');
  const isNew = !task.id;
  const [f, setF] = useState({ title: '', desc: '', date: todayKey(), time: '', repeat: 'none', until: '', remind: null, roomId: '', priority: 'normal', done: false, assignee: '', ...task });
  const [autoTime, setAutoTime] = useState(false);
  const roomName = roomIndex(state)[f.roomId]?.room.name || '';
  const setRemind = (v) => {
    if (v != null && !f.time) { setF({ ...f, remind: v, time: '08:00' }); setAutoTime(true); } else setF({ ...f, remind: v });
  };
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = () => {
    if (!f.title.trim()) return;
    const clean = { ...f, id: f.id || uid(), title: f.title.trim() };
    if (clean.repeat === 'none') { delete clean.until; delete clean.doneDates; }
    dispatch({ type: 'SAVE_TASK', task: clean });
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title={isNew ? 'Task mới' : 'Sửa task'}
      footer={(
        <>
          {!isNew && <button className="icon-btn danger" onClick={() => { dispatch({ type: 'DELETE_TASK', id: f.id }); onClose(); }} aria-label="Xoá task"><Trash2 size={18} /></button>}
          <button className="btn primary block" onClick={save} disabled={!f.title.trim()}>Lưu task</button>
        </>
      )}>
      <Field label="Tiêu đề"><input className="input" autoFocus value={f.title} onChange={set('title')} placeholder="VD: Thay ga giường phòng 101" /></Field>
      <Field label="Mô tả"><textarea className="input" rows={3} value={f.desc} onChange={set('desc')} placeholder="Chi tiết công việc…" /></Field>
      <div className="grid2">
        <Field label="Ngày"><input type="date" className="input" value={f.date} onChange={set('date')} /></Field>
        <Field label="Giờ (tuỳ chọn)" hint={autoTime ? 'Tự đặt 08:00 để nhắc, sửa được' : null}>
          <input type="time" className="input" value={f.time || ''} onChange={(e) => { setAutoTime(false); setF({ ...f, time: e.target.value }); }} />
        </Field>
      </div>
      <Field label="Lặp lại">
        <div className="chip-row">
          {REPEATS.map((r) => (
            <button key={r.id} type="button" className={`mini-chip ${(f.repeat || 'none') === r.id ? 'on' : ''}`} style={{ '--pc': '#6B4FD8' }} onClick={() => setF({ ...f, repeat: r.id })}>
              {r.id === 'none' ? r.label : repeatLabel({ ...f, repeat: r.id }) || r.label}
            </button>
          ))}
        </div>
      </Field>
      {f.repeat && f.repeat !== 'none' && (
        <Field label="Lặp đến ngày (để trống = không kết thúc)"><input type="date" className="input" min={f.date} value={f.until || ''} onChange={set('until')} /></Field>
      )}
      <Field label="Nhắc trước">
        <div className="chip-row">
          {REMINDS.map((r) => (
            <button key={String(r.v)} type="button" className={`mini-chip ${(f.remind ?? null) === r.v ? 'on' : ''}`} style={{ '--pc': '#6B4FD8' }} onClick={() => setRemind(r.v)}>{r.label}</button>
          ))}
        </div>
      </Field>
      {(f.remind != null || f.time) && f.title.trim() && (
        <div className="remind-box">
          <b><CalendarPlus size={16} /> Thêm lời nhắc vào điện thoại</b>
          <small>
            {f.time ? `${dm(f.date)} lúc ${f.time}` : `${dm(f.date)} (cả ngày)`}
            {f.repeat && f.repeat !== 'none' ? ` · ${repeatLabel(f)}` : ''}
            {f.remind != null ? ` · nhắc ${f.remind === 0 ? 'đúng giờ' : `trước ${REMINDS.find((r) => r.v === f.remind)?.label}`}` : ''}
          </small>
          <div className="row gap8 wrap">
            <a className="btn ghost" href={icsUrl(f, roomName)} target="_blank" rel="noopener"><Clock size={16} /> Lịch iPhone / tệp .ics</a>
            <a className="btn ghost" href={googleUrl(f, roomName)} target="_blank" rel="noopener"><CalendarPlus size={16} /> Google Calendar</a>
          </div>
          <small className="muted">iPhone: mở bằng Safari rồi bấm "Thêm vào Lịch". Google Calendar dùng thông báo mặc định của lịch. Sửa task trong app thì bấm thêm lại để cập nhật.</small>
        </div>
      )}
      <Field label="Phòng">
        <select className="input" value={f.roomId} onChange={set('roomId')}>
          <option value="">Chung</option>
          {state.locations.map((l) => (
            <optgroup key={l.id} label={l.name}>{l.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</optgroup>
          ))}
        </select>
      </Field>

      {members.length > 0 && (
        <Field label="Giao cho" hint="Nhân viên dọn phòng chỉ thấy task chung và task được giao cho mình">
          <select className="input" value={f.assignee || ''} onChange={set('assignee')}>
            <option value="">Chung (mọi người)</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.username})</option>)}
          </select>
        </Field>
      )}
      <Field label="Mức độ">
        <div className="seg wide">
          {PRIORITIES.map((p) => <button key={p.id} type="button" className={f.priority === p.id ? 'on' : ''} onClick={() => setF({ ...f, priority: p.id })}>{p.label}</button>)}
        </div>
      </Field>
    </Sheet>
  );
}
