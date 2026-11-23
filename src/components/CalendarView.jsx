import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, MapPin } from '../lib/icons.jsx';
import { useStore } from '../lib/store.jsx';
import { reducedMotion } from '../lib/motion.js';
import { getBookings, getCleanings, allRooms, roomIndex } from '../lib/derive.js';
import {
  todayKey, addDays, startOfWeek, startOfMonth, endOfMonth, addMonths, rangeKeys, diffDays,
  WD_SHORT, wdShort, monthTitle, dm, timeAgo,
} from '../lib/dates.js';
import CleaningPanel from './CleaningPanel.jsx';

const MAX_LANES = 3;

function layoutSegments(bookings, weekStart, days = 7) {
  const weekEnd = addDays(weekStart, days - 1);
  const segs = [];
  for (const b of bookings) {
    if (b.end < weekStart || b.start > weekEnd) continue;
    const s = diffDays(weekStart, b.start) + 0.5;
    const e = diffDays(weekStart, b.end) + 0.5;
    const cs = Math.max(s, 0);
    const ce = Math.min(e, days);
    if (ce <= cs) continue;
    segs.push({ b, cs, ce, openL: s < 0, openR: e > days });
  }
  segs.sort((x, y) => x.cs - y.cs || y.ce - x.ce);
  const laneEnds = [];
  for (const sg of segs) {
    let lane = laneEnds.findIndex((end) => end <= sg.cs + 0.001);
    if (lane < 0) { lane = laneEnds.length; laneEnds.push(0); }
    laneEnds[lane] = sg.ce;
    sg.lane = lane;
  }
  return { segs, lanes: laneEnds.length };
}

const pct = (v, days = 7) => `${(v / days) * 100}%`;

function Bar({ sg, label, top, onClick }) {
  const { b } = sg;
  const delay = `${Math.round(sg.cs * 45 + (sg.lane || 0) * 30)}ms`;
  return (
    <button
      className={`bar ${b.blocked ? 'blocked' : ''} ${sg.openL ? 'open-l' : ''} ${sg.openR ? 'open-r' : ''}`}
      style={{ left: `calc(${pct(sg.cs)} + 2px)`, width: `calc(${pct(sg.ce - sg.cs)} - 4px)`, top, '--bc': b.color, animationDelay: delay }}
      onClick={(e) => { e.stopPropagation(); onClick(b); }}
      title={`${label} · ${b.platform} · ${dm(b.start)} → ${dm(b.end)}`}
    >
      <span>{label}</span>
    </button>
  );
}

function MonthGrid({ anchor, bookings, selected, onSelect, onBooking, cleanDays, noteDays, labelFor }) {
  const first = startOfWeek(startOfMonth(anchor));
  const last = addDays(startOfWeek(endOfMonth(anchor)), 6);
  const all = rangeKeys(first, last);
  const weeks = [];
  for (let i = 0; i < all.length; i += 7) weeks.push(all.slice(i, i + 7));
  const month = anchor.slice(0, 7);
  const today = todayKey();

  return (
    <div className="month">
      <div className="month-head">{WD_SHORT.map((d) => <span key={d}>{d}</span>)}</div>
      {weeks.map((week) => {
        const { segs, lanes } = layoutSegments(bookings, week[0]);
        const hidden = Array(7).fill(0);
        for (const sg of segs) if (sg.lane >= MAX_LANES) for (let d = Math.floor(sg.cs); d < Math.ceil(sg.ce); d++) hidden[d]++;
        const shown = Math.min(lanes, MAX_LANES);
        const height = 40 + shown * 20 + (hidden.some(Boolean) ? 16 : 6);
        return (
          <div className="month-week" key={week[0]} style={{ height }}>
            {week.map((d) => (
              <button
                key={d}
                className={`mday ${d.slice(0, 7) !== month ? 'out' : ''} ${d === today ? 'today' : ''} ${d === selected ? 'sel' : ''}`}
                onClick={() => onSelect(d)}
                aria-label={`Ngày ${dm(d)}`}
                aria-pressed={d === selected}
              >
                <span className="mnum">{Number(d.slice(8))}</span>
                <span className="mdots">
                  {cleanDays.has(d) && <i className="dot clean" title="Có phòng cần dọn" />}
                  {noteDays.has(d) && <i className="dot note" title="Có ghi chú" />}
                </span>
                {hidden[week.indexOf(d)] > 0 && <span className="mmore">+{hidden[week.indexOf(d)]}</span>}
              </button>
            ))}
            {segs.filter((sg) => sg.lane < MAX_LANES).map((sg) => (
              <Bar key={sg.b.id} sg={sg} label={labelFor(sg.b)} top={36 + sg.lane * 20} onClick={onBooking} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function WeekTimeline({ start, rooms, bookings, selected, onSelect, onBooking, cleanDays, noteDays }) {
  const days = rangeKeys(start, addDays(start, 6));
  const today = todayKey();
  const multiLoc = new Set(rooms.map((r) => r.location.id)).size > 1;
  let lastLoc = null;
  return (
    <div className="week">
      <div className="week-pills">
        <div className="week-corner" />
        {days.map((d) => (
          <button key={d} className={`wpill ${d === selected ? 'sel' : ''} ${d === today ? 'today' : ''}`} onClick={() => onSelect(d)} aria-pressed={d === selected}>
            <span>{wdShort(d)}</span>
            <b>{Number(d.slice(8))}</b>
            <span className="mdots">
              {cleanDays.has(d) && <i className="dot clean" />}
              {noteDays.has(d) && <i className="dot note" />}
            </span>
          </button>
        ))}
      </div>
      <div className="week-rows">
        {rooms.map((room) => {
          const { segs, lanes } = layoutSegments(bookings.filter((b) => b.roomId === room.id), start);
          const showLoc = multiLoc && lastLoc !== room.location.id;
          lastLoc = room.location.id;
          return (
            <div key={room.id}>
              {showLoc && <div className="week-loc"><MapPin size={14} /> {room.location.name}</div>}
              <div className="week-row">
                <div className="week-room" title={room.name}>{room.name}</div>
                <div className="week-track" style={{ height: Math.max(1, lanes) * 30 + 10 }}>
                  {days.map((d, i) => (
                    <div key={d} className={`wcol ${d === selected ? 'sel' : ''} ${d === today ? 'today' : ''}`} style={{ left: pct(i), width: pct(1) }} onClick={() => onSelect(d)} />
                  ))}
                  {segs.map((sg) => (
                    <Bar key={sg.b.id} sg={sg} label={sg.b.source === 'manual' ? sg.b.summary : sg.b.platform} top={6 + sg.lane * 30} onClick={onBooking} />
                  ))}
                </div>
              </div>
            </div>
          );
        })}
        {rooms.length === 0 && <p className="empty">Chưa có phòng nào.</p>}
      </div>
    </div>
  );
}

export default function CalendarView({ api, focus }) {
  const { state, dispatch, sync, syncing } = useStore();
  const view = state.settings.calView || 'month';
  const [anchor, setAnchor] = useState(focus.date);
  const [selected, setSelected] = useState(focus.selected);
  const [locId, setLocId] = useState('');

  useEffect(() => { setAnchor(focus.date); setSelected(focus.selected); }, [focus.nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  // Mở từ nút "Ghi chú": cuộn tới ô ghi chú của ngày (sau khi trang render xong và đã cuộn lên đầu)
  useEffect(() => {
    if (focus.section !== 'note') return undefined;
    const t = setTimeout(() => {
      const box = document.querySelector('.note-box');
      const ta = document.getElementById('day-note');
      if (!box) return;
      box.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
      box.classList.remove('flash'); void box.offsetWidth; box.classList.add('flash');
      if (ta && !ta.readOnly) setTimeout(() => ta.focus({ preventScroll: true }), 450);
    }, 380);
    return () => clearTimeout(t);
  }, [focus.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const bookings = useMemo(() => getBookings(state), [state]);
  const idx = useMemo(() => roomIndex(state), [state]);
  const rooms = allRooms(state, locId);
  const roomIds = new Set(rooms.map((r) => r.id));
  const visible = bookings.filter((b) => roomIds.has(b.roomId));

  const from = view === 'week' ? startOfWeek(anchor) : startOfMonth(anchor);
  const to = view === 'week' ? addDays(from, 6) : endOfMonth(anchor);
  const gridFrom = view === 'week' ? from : startOfWeek(from);
  const gridTo = view === 'week' ? to : addDays(startOfWeek(to), 6);

  const gridCleanings = useMemo(() => getCleanings(state, bookings, gridFrom, gridTo, locId), [state, bookings, gridFrom, gridTo, locId]);
  const cleanDays = new Set(gridCleanings.map((c) => c.date));
  const noteDays = new Set(Object.keys(state.notes));

  const shift = (n) => { setSelected(null); setAnchor(view === 'week' ? addDays(anchor, 7 * n) : addMonths(anchor, n)); };
  const setView = (v) => { dispatch({ type: 'SETTINGS', patch: { calView: v } }); if (selected) setAnchor(selected); };
  const onSelect = (d) => setSelected((s) => (s === d ? null : d));
  const goToday = () => { setAnchor(todayKey()); setSelected(todayKey()); };

  const title = view === 'week' ? `${dm(from)} – ${dm(to)}` : monthTitle(anchor);
  const multiRoom = rooms.length > 1;
  const labelFor = (b) => (multiRoom ? idx[b.roomId]?.room.name || b.platform : b.source === 'manual' ? b.summary : b.platform);

  return (
    <div className="cal-page">
      <div className="cal-main">
        <header className="page-head">
          <div>
            <h1>Lịch đặt phòng</h1>
            <p className="sub">Đồng bộ {timeAgo(state.lastSync)}</p>
          </div>
          <button className="icon-btn" onClick={() => sync()} aria-label="Đồng bộ lại" disabled={syncing}><RefreshCw size={19} className={syncing ? 'spin' : ''} /></button>
        </header>

        {state.locations.length > 1 && (
          <div className="chips scroll-x">
            <button className={`chip ${!locId ? 'on' : ''}`} onClick={() => setLocId('')}>Tất cả</button>
            {state.locations.map((l) => (
              <button key={l.id} className={`chip ${locId === l.id ? 'on' : ''}`} onClick={() => setLocId(l.id)}><MapPin size={14} />{l.name}</button>
            ))}
          </div>
        )}

        <div className="cal-toolbar">
          <div className="seg" role="tablist">
            <button role="tab" aria-selected={view === 'week'} className={view === 'week' ? 'on' : ''} onClick={() => setView('week')}>Tuần</button>
            <button role="tab" aria-selected={view === 'month'} className={view === 'month' ? 'on' : ''} onClick={() => setView('month')}>Tháng</button>
          </div>
          <div className="cal-nav">
            <button className="icon-btn sm" onClick={() => shift(-1)} aria-label="Trước"><ChevronLeft size={18} /></button>
            <b className="cal-title">{title}</b>
            <button className="icon-btn sm" onClick={() => shift(1)} aria-label="Sau"><ChevronRight size={18} /></button>
          </div>
          <button className="btn tiny" onClick={goToday}>Hôm nay</button>
        </div>

        <div className="cal-card">
          {view === 'month' ? (
            <MonthGrid key={`m${anchor.slice(0, 7)}${locId}`} anchor={anchor} bookings={visible} selected={selected} onSelect={onSelect} onBooking={api.openBooking} cleanDays={cleanDays} noteDays={noteDays} labelFor={labelFor} />
          ) : (
            <WeekTimeline key={`w${from}${locId}`} start={from} rooms={rooms} bookings={visible} selected={selected} onSelect={onSelect} onBooking={api.openBooking} cleanDays={cleanDays} noteDays={noteDays} />
          )}
          <Legend bookings={visible} />
        </div>
      </div>

      <aside className="cal-side">
        <CleaningPanel
          api={api}
          bookings={bookings}
          locId={locId}
          from={from}
          to={to}
          view={view}
          anchor={anchor}
          selected={selected}
          clearSelected={() => setSelected(null)}
          selectDay={(d) => setSelected(d)}
        />
      </aside>
    </div>
  );
}

function Legend({ bookings }) {
  const seen = new Map();
  for (const b of bookings) if (!b.blocked && !seen.has(b.platform)) seen.set(b.platform, b.color);
  const hasBlocked = bookings.some((b) => b.blocked);
  if (!seen.size && !hasBlocked) return <p className="legend muted">Chưa có đặt phòng nào. Thêm link iCal ở mục Cơ sở hoặc tạo đặt phòng thủ công.</p>;
  return (
    <div className="legend">
      {[...seen].map(([p, c]) => <span key={p}><i style={{ background: c }} />{p}</span>)}
      {hasBlocked && <span><i className="hatch" />Khoá phòng</span>}
      <span><i className="dot clean" />Dọn phòng</span>
      <span><i className="dot note" />Ghi chú</span>
    </div>
  );
}
