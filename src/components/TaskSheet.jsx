import { useState } from 'react';
import { Trash2 } from '../lib/icons.jsx';
import { useStore, uid } from '../lib/store.jsx';
import { todayKey } from '../lib/dates.js';
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
  const [f, setF] = useState({ title: '', desc: '', date: todayKey(), roomId: '', priority: 'normal', done: false, assignee: '', ...task });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = () => {
    if (!f.title.trim()) return;
    dispatch({ type: 'SAVE_TASK', task: { ...f, id: f.id || uid(), title: f.title.trim() } });
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
        <Field label="Phòng">
          <select className="input" value={f.roomId} onChange={set('roomId')}>
            <option value="">Chung</option>
            {state.locations.map((l) => (
              <optgroup key={l.id} label={l.name}>{l.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</optgroup>
            ))}
          </select>
        </Field>
      </div>
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
