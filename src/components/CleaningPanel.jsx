import { useMemo } from 'react';
import { Copy, X, Check, LogIn, LogOut, BedDouble, NotebookPen, Sparkles, ArrowRight, MapPin } from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import { getCleanings, cleaningStatus, cleaningText, copyText, arrivalsOn, departuresOn, occupiedOn, roomIndex } from '../lib/derive.js';
import { dm, longDate, monthTitle, wdLong } from '../lib/dates.js';
import { toast, Progress } from './ui.jsx';

export function CleaningCard({ c, compact }) {
  const { state, dispatch } = useStore();
  const st = cleaningStatus(c);
  const copyOne = async () => {
    const ok = await copyText(cleaningText(state, [c], { title: `DỌN PHÒNG – ${c.room.name}`, notes: {} }));
    toast(ok ? 'Đã copy thẻ dọn phòng' : 'Không copy được');
  };
  return (
    <div className={`clean-card tone-${st.tone} ${c.done ? 'done' : ''}`}>
      <button className={`check ${c.done ? 'on' : ''}`} onClick={() => dispatch({ type: 'TOGGLE_CLEAN', id: c.id })} aria-label={c.done ? 'Bỏ đánh dấu đã dọn' : 'Đánh dấu đã dọn'}>
        {c.done && <Check size={14} strokeWidth={3} />}
      </button>
      <div className="clean-body">
        <div className="clean-title">
          <b>{c.room.name}</b>
          {!compact && state.locations.length > 1 && <span className="clean-loc"><MapPin size={12} />{c.location.name}</span>}
        </div>
        <div className="clean-times">
          <span className="tpill out"><LogOut size={12} /> Trả {c.outTime}</span>
          <ArrowRight size={13} className="muted" />
          {c.sameDay
            ? <span className="tpill in"><LogIn size={12} /> Nhận {c.inTime}</span>
            : <span className="tpill free">{c.next ? `Trống đến ${dm(c.next.start)}` : 'Trống'}</span>}
        </div>
        <div className="clean-meta">
          <span className="pdot" style={{ background: c.outBooking.color }} />{c.outPlatform}
          {c.sameDay && <span className="pdot" style={{ background: c.next.color }} />}
          {c.sameDay && c.next.platform}
          <span className="sep">·</span>
          <span className={`status s-${st.tone}`}>{st.label}</span>
        </div>
      </div>
      <button className="icon-btn sm ghost-btn" onClick={copyOne} aria-label={`Copy thẻ dọn ${c.room.name}`}><Copy size={16} /></button>
    </div>
  );
}

export default function CleaningPanel({ api, bookings, locId, from, to, view, anchor, selected, clearSelected, selectDay }) {
  const { state, dispatch } = useStore();
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

  const groups = {};
  for (const c of cards) (groups[c.date] ||= []).push(c);
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
          <div className="note-box">
            <label htmlFor="day-note"><NotebookPen size={16} /> Ghi chú ngày {dm(selected)}</label>
            <textarea
              id="day-note"
              rows={3}
              placeholder="VD: Thay ga gối, khách cần thêm khăn, bảo trì máy lạnh…"
              value={state.notes[selected] || ''}
              onChange={(e) => dispatch({ type: 'SET_NOTE', date: selected, text: e.target.value })}
            />
            <span className="tiny muted">Ghi chú được lưu tự động và kèm theo khi copy thẻ dọn phòng.</span>
          </div>
        </>
      )}

      <div className="clean-list stagger" key={`${a}|${b}|${locId}`}>
        {cards.length === 0 && (
          <div className="empty-card"><Sparkles size={22} /><p>Không có phòng cần dọn {selected ? 'trong ngày này' : view === 'week' ? 'trong tuần này' : 'trong tháng này'}.</p></div>
        )}
        {selected
          ? cards.map((c) => <CleaningCard key={c.id} c={c} />)
          : Object.entries(groups).map(([date, list]) => (
            <div key={date} className="clean-group">
              <button className="group-head" onClick={() => selectDay(date)}>
                <span>{wdLong(date)}, {dm(date)}</span>
                <em>{list.length} phòng</em>
              </button>
              {list.map((c) => <CleaningCard key={c.id} c={c} />)}
            </div>
          ))}
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
