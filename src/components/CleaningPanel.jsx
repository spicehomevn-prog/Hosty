import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, X, Check, LogIn, LogOut, BedDouble, NotebookPen, Sparkles, ArrowRight, MapPin, Pencil, Plus, Trash2, History, ChevronDown } from '../lib/icons.jsx';
import { useStore, uid } from '../lib/store.jsx';
import { getCleanings, cleaningStatus, cleaningText, copyText, arrivalsOn, departuresOn, occupiedOn, roomIndex } from '../lib/derive.js';
import { dm, longDate, monthTitle, wdLong, wdShort, todayKey } from '../lib/dates.js';
import { toast, Progress, Sheet, Field } from './ui.jsx';
import { reducedMotion } from '../lib/motion.js';
import { can } from '../lib/perm.js';

const hhmm = (ts) => { const d = new Date(ts); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

export function CleaningCard({ c, compact, showDate, onEdit }) {
  const { state, dispatch, user } = useStore();
  const [anim, setAnim] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const st = cleaningStatus(c);
  const copyOne = async () => {
    const ok = await copyText(cleaningText(state, [c], { title: `DỌN PHÒNG – ${c.room.name}`, notes: {} }));
    toast(ok ? 'Đã copy thẻ dọn phòng' : 'Không copy được');
  };
  const toggle = () => {
    if (anim) return;
    const go = () => dispatch({ type: 'TOGGLE_CLEAN', id: c.id, by: user?.id, byName: user?.name });
    if (c.done || reducedMotion()) { go(); return; }
    // animation ô tích hoàn thành, xong mới chuyển thẻ xuống nhóm "Phòng đã dọn"
    setAnim(true);
    timer.current = setTimeout(() => { go(); setAnim(false); }, 900);
  };
  const on = c.done || anim;
  return (
    <div className={`clean-card tone-${st.tone} ${c.done ? 'done' : ''} ${anim ? 'celebrate' : ''}`}>
      <button className={`check ${on ? 'on' : ''} ${anim ? 'anim' : ''}`} onClick={toggle} aria-label={c.done ? 'Bỏ đánh dấu đã dọn' : 'Đánh dấu đã dọn'}>
        {anim
          ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path className="check-draw" d="M5 12.5 L10 17.5 L19 7" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          : c.done && <Check size={14} strokeWidth={3} />}
        {anim && <span className="check-burst" aria-hidden="true">{[0, 60, 120, 180, 240, 300].map((r) => <i key={r} style={{ '--a': `${r}deg` }} />)}</span>}
      </button>
      <div className="clean-body">
        <div className="clean-title">
          <b>{c.room.name}</b>
          {showDate && <span className="clean-date">{wdShort(c.date)} {dm(c.date)}</span>}
          {!compact && state.locations.length > 1 && <span className="clean-loc"><MapPin size={12} />{c.location.name}</span>}
        </div>
        <div className="clean-times">
          {c.custom
            ? <span className="tpill out"><Sparkles size={12} /> {c.outTime ? `Dọn ${c.outTime}` : 'Dọn phòng'}</span>
            : <span className="tpill out"><LogOut size={12} /> Trả {c.outTime}</span>}
          <ArrowRight size={13} className="muted" />
          {c.sameDay
            ? <span className="tpill in"><LogIn size={12} /> Nhận {c.inTime}</span>
            : <span className="tpill free">{c.next ? `Trống đến ${dm(c.next.start)}` : 'Trống'}</span>}
        </div>
        <div className="clean-meta">
          {c.outBooking ? <><span className="pdot" style={{ background: c.outBooking.color }} />{c.outPlatform}</> : <em className="clean-flag">Thêm tay</em>}
          {c.sameDay && <span className="pdot" style={{ background: c.next.color }} />}
          {c.sameDay && c.next.platform}
          {c.moved && <em className="clean-flag">Dời từ {dm(c.origDate)}</em>}
          <span className="sep">·</span>
          <span className={`status s-${st.tone}`}>{st.label}</span>
        </div>
        {c.note
          ? (onEdit
            ? <button className="clean-note" onClick={() => onEdit(c, { focusNote: true })}><NotebookPen size={13} /><span>{c.note}</span></button>
            : <div className="clean-note"><NotebookPen size={13} /><span>{c.note}</span></div>)
          : onEdit && <button className="clean-add-note" onClick={() => onEdit(c, { focusNote: true })}><Plus size={12} /> Ghi chú</button>}
        {c.done && c.doneInfo?.at && (
          <div className="clean-done-by"><Check size={12} strokeWidth={3} /> Đã dọn{c.doneInfo.byName ? ` · ${c.doneInfo.byName}` : ''} lúc {hhmm(c.doneInfo.at)}</div>
        )}
      </div>
      <div className="clean-actions">
        <button className="icon-btn sm ghost-btn" onClick={copyOne} aria-label={`Copy thẻ dọn ${c.room.name}`}><Copy size={16} /></button>
        {onEdit && <button className="icon-btn sm ghost-btn" onClick={() => onEdit(c)} aria-label={`Sửa thẻ dọn ${c.room.name}`}><Pencil size={15} /></button>}
      </div>
    </div>
  );
}

/**
 * Danh sách thẻ dọn phòng: thẻ chưa dọn ở trên (nhóm theo ngày nếu `grouped`),
 * thẻ đã dọn gom vào nhóm thu gọn "Phòng đã dọn" ở dưới cùng.
 * Admin: sửa / dời ngày / xoá thẻ, thêm thẻ (addDate = ngày mặc định của thẻ mới).
 */
export function CleaningList({ cards, grouped, selectDay, addDate, emptyText, compact }) {
  const { role } = useStore();
  const canEdit = can(role, 'booking');
  const [sheet, setSheet] = useState(null);
  const [openDone, setOpenDone] = useState(false);
  const todo = cards.filter((c) => !c.done);
  const done = cards.filter((c) => c.done);
  const edit = canEdit ? (c, opt) => setSheet({ card: c, ...opt }) : null;
  const groups = {};
  for (const c of todo) (groups[c.date] ||= []).push(c);
  const multiDay = new Set(cards.map((c) => c.date)).size > 1;
  return (
    <>
      {cards.length === 0 && <div className="empty-card"><Sparkles size={22} /><p>{emptyText}</p></div>}
      {cards.length > 0 && todo.length === 0 && <div className="empty-card all-clean"><Check size={22} strokeWidth={3} /><p>Đã dọn xong tất cả {done.length} phòng.</p></div>}
      {grouped
        ? Object.entries(groups).map(([date, list]) => (
          <div key={date} className="clean-group">
            <button className="group-head" onClick={() => selectDay?.(date)}>
              <span>{wdLong(date)}, {dm(date)}</span>
              <em>{list.length} phòng</em>
            </button>
            {list.map((c) => <CleaningCard key={c.id} c={c} compact={compact} onEdit={edit} />)}
          </div>
        ))
        : todo.map((c) => <CleaningCard key={c.id} c={c} compact={compact} onEdit={edit} />)}
      {done.length > 0 && (
        <div className={`done-group ${openDone ? 'open' : ''}`}>
          <button className="done-head" onClick={() => setOpenDone(!openDone)} aria-expanded={openDone}>
            <span className="done-ico"><Check size={14} strokeWidth={3} /></span>
            <b>Phòng đã dọn</b><em>{done.length}</em>
            <ChevronDown size={16} className="done-chev" />
          </button>
          {openDone && <div className="done-list">{done.map((c) => <CleaningCard key={c.id} c={c} compact={compact} showDate={multiDay} onEdit={edit} />)}</div>}
        </div>
      )}
      {canEdit && addDate && (
        <button className="add-clean" onClick={() => setSheet({ card: null })}><Plus size={16} /> Thêm thẻ dọn phòng</button>
      )}
      {sheet && <CleanSheet card={sheet.card} focusNote={sheet.focusNote} defaultDate={addDate} onClose={() => setSheet(null)} />}
    </>
  );
}

/** Sửa / dời ngày / xoá thẻ dọn phòng, hoặc thêm thẻ mới (admin) */
function CleanSheet({ card, focusNote, defaultDate, onClose }) {
  const { state, dispatch } = useStore();
  const isNew = !card;
  const custom = isNew || card.custom;
  const extra = custom && !isNew ? (state.cleanExtra || []).find((x) => x.id === card.id) : null;
  const firstRoom = state.locations[0]?.rooms[0]?.id || '';
  const [f, setF] = useState(() => ({
    roomId: card?.roomId || firstRoom, date: card?.date || defaultDate || todayKey(), time: extra?.time || '',
    note: (custom ? extra?.note : state.cleanNotes?.[card.id]) || '',
  }));
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = () => {
    if (!f.date || !f.roomId) return;
    if (custom) {
      dispatch({ type: 'SAVE_CLEAN_EXTRA', card: { id: extra?.id || `x-${uid()}`, roomId: f.roomId, date: f.date, time: f.time, note: f.note.trim() } });
      toast(isNew ? 'Đã thêm thẻ dọn phòng' : 'Đã lưu thẻ dọn phòng');
    } else {
      if (f.date !== card.date) {
        dispatch({ type: 'CLEAN_ADJ', id: card.id, patch: f.date === card.origDate ? null : { date: f.date } });
      }
      if ((state.cleanNotes?.[card.id] || '') !== f.note.trim()) dispatch({ type: 'CLEAN_NOTE', id: card.id, text: f.note });
      toast(f.date !== card.date ? (f.date === card.origDate ? 'Đã đưa thẻ về ngày trả phòng' : `Đã dời thẻ sang ${dm(f.date)}`) : 'Đã lưu thẻ dọn phòng');
    }
    onClose();
  };
  const remove = () => {
    if (custom) dispatch({ type: 'DELETE_CLEAN_EXTRA', id: card.id });
    else dispatch({ type: 'CLEAN_ADJ', id: card.id, patch: { hide: true } });
    toast('Đã xoá thẻ dọn phòng');
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title={isNew ? 'Thêm thẻ dọn phòng' : 'Sửa thẻ dọn phòng'}
      footer={<>
        {!isNew && <button className="icon-btn danger" onClick={remove} aria-label="Xoá thẻ dọn phòng"><Trash2 size={18} /></button>}
        <button className="btn primary block" onClick={save}>{isNew ? 'Thêm thẻ' : 'Lưu thẻ'}</button>
      </>}>
      {!custom && (
        <div className="fin-note">
          <b>{card.room.name}</b> · khách {card.outPlatform} trả phòng {dm(card.origDate)} lúc {card.outTime}.
          {card.moved ? ` Đang dời sang ${dm(card.date)}.` : ''} Dời ngày dọn nếu nhân viên dọn vào hôm khác; xoá thẻ nếu không cần dọn.
        </div>
      )}
      {custom && (
        <Field label="Phòng">
          <select className="input" value={f.roomId} onChange={set('roomId')}>
            {state.locations.map((l) => <optgroup key={l.id} label={l.name}>{l.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</optgroup>)}
          </select>
        </Field>
      )}
      <div className="grid2">
        <Field label="Ngày dọn"><input type="date" className="input" value={f.date} onChange={set('date')} /></Field>
        {custom && <Field label="Giờ dọn (tuỳ chọn)"><input type="time" className="input" value={f.time} onChange={set('time')} /></Field>}
      </div>
      {!custom && card.moved && (
        <button className="btn ghost block" onClick={() => setF({ ...f, date: card.origDate })}><History size={16} /> Về ngày trả phòng {dm(card.origDate)}</button>
      )}
      <Field label={custom ? 'Ghi chú' : 'Ghi chú cho thẻ này'} hint="Nhân viên dọn phòng thấy ghi chú này trên thẻ và khi copy gửi Zalo">
        <textarea className="input" rows={2} value={f.note} onChange={set('note')} autoFocus={!!focusNote}
          placeholder={custom ? 'VD: Tổng vệ sinh, thay rèm, khách ở dài ngày…' : 'VD: Khách làm đổ cà phê ra thảm, cần giặt'} />
      </Field>
    </Sheet>
  );
}

export default function CleaningPanel({ api, bookings, locId, from, to, view, anchor, selected, clearSelected, selectDay }) {
  const { state, dispatch, role } = useStore();
  const canNote = can(role, 'note.edit');
  const idx = useMemo(() => roomIndex(state), [state]);
  const a = selected || from;
  const b = selected || to;
  const cards = useMemo(() => getCleanings(state, bookings, a, b, locId), [state, bookings, a, b, locId]);
  const inLoc = (bk) => !locId || idx[bk.roomId]?.location.id === locId;

  const subtitle = selected ? longDate(selected) : view === 'week' ? `Tuần ${dm(from)} – ${dm(to)}` : monthTitle(anchor);
  const done = cards.filter((c) => c.done).length;

  const copyAll = async () => {
    const notes = Object.fromEntries(Object.entries(state.notes).filter(([d]) => d >= a && d <= b));
    const ok = await copyText(cleaningText(state, cards, { title: `LỊCH DỌN PHÒNG – ${subtitle}`, notes }));
    toast(ok ? `Đã copy ${cards.length} thẻ dọn phòng` : 'Không copy được');
  };

  // thẻ admin đã xoá trong khoảng đang xem (mã thẻ = "ngày trả|phòng")
  const hidden = Object.entries(state.cleanAdj || {}).filter(([id, v]) => v?.hide && id.slice(0, 10) >= a && id.slice(0, 10) <= b).map(([id]) => id);
  const rangeNotes = Object.entries(state.notes).filter(([d]) => d >= a && d <= b).sort();

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Thẻ dọn phòng</h2>
          <p className="sub">{subtitle}</p>
        </div>
        <button className="btn grad" onClick={copyAll} disabled={!cards.length}><Copy size={16} /> Copy thẻ</button>
      </div>

      {selected && (
        <button className="chip on closable" onClick={clearSelected}>
          Đang xem {dm(selected)} · xem cả {view === 'week' ? 'tuần' : 'tháng'} <X size={14} />
        </button>
      )}

      {cards.length > 0 && (
        <div className="panel-progress">
          <span>Đã dọn <b>{done}/{cards.length}</b></span>
          <Progress value={(done / cards.length) * 100} />
        </div>
      )}

      {selected && (
        <>
          <div className="day-stats">
            <div className="stat violet"><LogIn size={16} /><b>{arrivalsOn(bookings, selected).filter(inLoc).length}</b><span>Nhận phòng</span></div>
            <div className="stat yellow"><LogOut size={16} /><b>{departuresOn(bookings, selected).filter(inLoc).length}</b><span>Trả phòng</span></div>
            <div className="stat blue"><BedDouble size={16} /><b>{occupiedOn(bookings, selected).filter(inLoc).length}</b><span>Đang ở</span></div>
          </div>
          {(canNote || state.notes[selected]) && <div className="note-box">
            <label htmlFor="day-note"><NotebookPen size={16} /> Ghi chú ngày {dm(selected)}</label>
            <textarea
              id="day-note"
              rows={3}
              placeholder="VD: Thay ga gối, khách cần thêm khăn, bảo trì máy lạnh…"
              value={state.notes[selected] || ''}
              readOnly={!canNote}
              onChange={(e) => canNote && dispatch({ type: 'SET_NOTE', date: selected, text: e.target.value })}
            />
            <span className="tiny muted">{canNote ? 'Ghi chú được lưu tự động và kèm theo khi copy thẻ dọn phòng.' : 'Ghi chú của admin cơ sở.'}</span>
          </div>}
        </>
      )}

      <div className="clean-list" key={`${a}|${b}|${locId}`}>
        <CleaningList cards={cards} grouped={!selected} selectDay={selectDay} addDate={selected || (todayKey() >= a && todayKey() <= b ? todayKey() : a)}
          emptyText={`Không có phòng cần dọn ${selected ? 'trong ngày này' : view === 'week' ? 'trong tuần này' : 'trong tháng này'}.`} />
        {hidden.length > 0 && can(role, 'booking') && (
          <button className="link restore-hidden" onClick={() => { hidden.forEach((id) => dispatch({ type: 'CLEAN_ADJ', id, patch: null })); toast(`Đã khôi phục ${hidden.length} thẻ`); }}>
            Khôi phục {hidden.length} thẻ đã xoá
          </button>
        )}
      </div>

      {selected && (
        <ArrivalList title="Khách nhận phòng" items={arrivalsOn(bookings, selected).filter(inLoc)} idx={idx} api={api} kind="in" />
      )}

      {!selected && rangeNotes.length > 0 && (
        <div className="notes-list">
          <h3><NotebookPen size={16} /> Ghi chú trong {view === 'week' ? 'tuần' : 'tháng'}</h3>
          {rangeNotes.map(([d, text]) => (
            <button key={d} className="note-item" onClick={() => selectDay(d)}>
              <b>{dm(d)}</b><span>{text}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ArrivalList({ title, items, idx, api, kind }) {
  if (!items.length) return null;
  return (
    <div className="arrivals">
      <h3>{title}</h3>
      {items.map((b) => (
        <button key={b.id} className="arrival" onClick={() => api.openBooking(b)}>
          <span className="pbar" style={{ background: b.color }} />
          <span className="arr-main"><b>{idx[b.roomId]?.room.name}</b><small>{b.platform} · {dm(b.start)} → {dm(b.end)}</small></span>
          <span className="tpill in">{kind === 'in' ? b.checkIn : b.checkOut}</span>
        </button>
      ))}
    </div>
  );
}
