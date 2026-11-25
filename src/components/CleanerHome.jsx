import { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, ListChecks, UserRound, Check, RefreshCw, ChevronLeft, NotebookPen } from '../lib/icons.jsx';
import { useStore } from '../lib/store.jsx';
import { getBookings, getCleanings } from '../lib/derive.js';
import { todayKey, addDays, dm, wdLong, diffDays } from '../lib/dates.js';
import { visibleTasks, canTickTask } from '../lib/perm.js';
import { taskInstances, isRepeating } from '../lib/tasks.js';
import { LogoMark } from './Logo.jsx';
import { InboxButton } from './Inbox.jsx';
import Places from './Places.jsx';
import { byLocation } from './CleaningPanel.jsx';
import { MapPin } from '../lib/icons.jsx';

/**
 * Màn hình riêng cho tài khoản Dọn phòng: to, rõ, ít chữ, một thao tác cho mỗi việc.
 * - Không có lịch phòng, giá, tên khách, sàn (máy chủ đã bỏ các dữ liệu này).
 * - 2 nút dưới: Dọn phòng · Việc khác. Tài khoản ở góc trên.
 */
const DAYS = [
  { off: -1, label: 'Hôm qua' },
  { off: 0, label: 'Hôm nay' },
  { off: 1, label: 'Ngày mai' },
];
const nowHM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const minutes = (hm) => { const [h, m] = String(hm || '').split(':').map(Number); return Number.isFinite(h) ? h * 60 + (m || 0) : null; };
const buzz = () => { try { navigator.vibrate?.(30); } catch { /* noop */ } };

export default function CleanerApp() {
  const [view, setView] = useState(() => (new URLSearchParams(location.search).get('tab') === 'tasks' ? 'tasks' : 'clean'));
  const [off, setOff] = useState(0);
  useEffect(() => { if (location.search) history.replaceState(null, '', location.pathname); }, []);
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    const onMsg = (e) => {
      if (e.data?.type !== 'open') return;
      const t = new URL(e.data.url || '/', location.origin).searchParams.get('tab');
      setView(t === 'tasks' ? 'tasks' : 'clean');
    };
    navigator.serviceWorker.addEventListener('message', onMsg);
    return () => navigator.serviceWorker.removeEventListener('message', onMsg);
  }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [view]);

  const api = {
    goto: (t) => setView(t === 'tasks' ? 'tasks' : t === 'places' ? 'account' : 'clean'),
    openDay: (d) => { const o = diffDays(todayKey(), d); setOff(Math.max(-1, Math.min(1, o))); setView('clean'); },
    editSetup: () => {},
  };

  return (
    <div className="app cleaner-app">
      <main className="page cl-page">
        {view === 'account' ? (
          <>
            <button className="cl-back" onClick={() => setView('clean')}><ChevronLeft size={22} /> Quay lại</button>
            <Places api={api} />
          </>
        ) : (
          <>
            <CleanerTop api={api} onAccount={() => setView('account')} />
            {view === 'clean' ? <CleanList off={off} setOff={setOff} /> : <TaskList />}
          </>
        )}
      </main>
      {view !== 'account' && (
        <nav className="cl-nav" aria-label="Điều hướng">
          <button className={view === 'clean' ? 'on' : ''} onClick={() => setView('clean')} aria-current={view === 'clean' ? 'page' : undefined}>
            <Sparkles size={24} /><span>Dọn phòng</span>
          </button>
          <button className={view === 'tasks' ? 'on' : ''} onClick={() => setView('tasks')} aria-current={view === 'tasks' ? 'page' : undefined}>
            <ListChecks size={24} /><span>Việc khác</span>
          </button>
        </nav>
      )}
    </div>
  );
}

function CleanerTop({ api, onAccount }) {
  const { sync, syncing, cloud, user, state } = useStore();
  const busy = syncing || cloud.status === 'syncing';
  return (
    <header className="cl-top">
      <div className="cl-hello">
        <LogoMark size={40} />
        <span><small>Xin chào</small><b>{user?.name || 'bạn'}</b></span>
      </div>
      <div className="row gap8">
        <button className="icon-btn" onClick={() => { sync(); cloud.syncNow(); }} disabled={busy} aria-label="Tải lại"><RefreshCw size={20} className={busy ? 'spin' : ''} /></button>
        <InboxButton api={api} />
        <button className="icon-btn" onClick={onAccount} aria-label="Tài khoản"><UserRound size={20} /></button>
      </div>
      {state.property?.name && <p className="cl-place">{state.property.name}</p>}
    </header>
  );
}

function CleanList({ off, setOff }) {
  const { state, dispatch, user } = useStore();
  const today = todayKey();
  const day = addDays(today, off);
  const bookings = useMemo(() => getBookings(state), [state]);
  const cards = getCleanings(state, bookings, day, day);
  const multiLoc = state.locations.length > 1;
  const [undo, setUndo] = useState(null); // { id, room }
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const toggle = (c) => {
    dispatch({ type: 'TOGGLE_CLEAN', id: c.id, by: user?.id, byName: user?.name });
    clearTimeout(timer.current);
    if (!c.done) {
      buzz();
      setUndo({ id: c.id, room: c.room.name });
      timer.current = setTimeout(() => setUndo(null), 5000);
    } else setUndo(null);
  };
  const undoNow = () => { if (undo) dispatch({ type: 'TOGGLE_CLEAN', id: undo.id, by: user?.id, byName: user?.name }); clearTimeout(timer.current); setUndo(null); };

  const left = cards.filter((c) => !c.done);
  const done = cards.filter((c) => c.done);
  const note = state.notes?.[day];
  const isToday = off === 0;

  return (
    <>
      <div className="cl-days" role="tablist" aria-label="Chọn ngày">
        {DAYS.map((d) => (
          <button key={d.off} role="tab" aria-selected={off === d.off} className={off === d.off ? 'on' : ''} onClick={() => setOff(d.off)}>{d.label}</button>
        ))}
      </div>
      <h1 className="cl-date">{DAYS.find((d) => d.off === off).label} · {wdLong(day)} {dm(day)}</h1>
      {cards.length > 0 && (
        <p className="cl-sum">
          {left.length ? <>Còn <b>{left.length}</b> phòng cần dọn</> : <>Đã dọn xong <b>{done.length}</b> phòng</>}
        </p>
      )}

      {note && <div className="cl-note day"><NotebookPen size={20} /><p>{note}</p></div>}

      {cards.length === 0 && (
        <div className="cl-empty">
          <span>🌿</span>
          <b>{isToday ? 'Hôm nay không có phòng cần dọn' : 'Không có phòng cần dọn'}</b>
          <small>Khi có khách trả phòng, thẻ sẽ tự hiện ở đây.</small>
        </div>
      )}
      {cards.length > 0 && !left.length && (
        <div className="cl-empty win"><span>🎉</span><b>Xong hết rồi!</b><small>Cảm ơn bạn. Các phòng đã dọn nằm bên dưới.</small></div>
      )}

      {multiLoc ? (
        // nhiều địa điểm: mỗi địa điểm một nhóm, phòng chưa dọn lên trước
        byLocation(cards, state.locations).map(({ loc, list }) => {
          const todo = list.filter((c) => !c.done);
          return (
            <section key={loc?.id || '-'} className="cl-loc">
              <h2 className="cl-loc-head"><MapPin size={22} /><span>{loc?.name || 'Khác'}</span><em>{todo.length ? `còn ${todo.length}/${list.length}` : 'xong hết'}</em></h2>
              <div className="cl-cards">
                {[...todo, ...list.filter((c) => c.done)].map((c) => <CleanCard key={c.id} c={c} day={day} isToday={isToday} onToggle={() => toggle(c)} />)}
              </div>
            </section>
          );
        })
      ) : (
        <div className="cl-cards">
          {[...left, ...done].map((c) => <CleanCard key={c.id} c={c} day={day} isToday={isToday} onToggle={() => toggle(c)} />)}
        </div>
      )}

      {undo && (
        <div className="cl-undo" role="status">
          <span><Check size={20} /> Đã dọn xong {undo.room}</span>
          <button onClick={undoNow}>Hoàn tác</button>
        </div>
      )}
    </>
  );
}

function CleanCard({ c, day, isToday, onToggle }) {
  const nextNights = c.next ? diffDays(c.next.start, c.next.end) : 0;
  // khách mới đến cùng ngày -> Gấp; còn ≤ 3 giờ nữa là khách tới -> ghi rõ
  const inMin = minutes(c.inTime);
  const soon = c.sameDay && isToday && inMin != null && inMin - minutes(nowHM()) <= 180;
  const tone = c.done ? 'done' : c.sameDay ? 'urgent' : 'today';
  const badge = c.done ? 'Đã xong' : soon ? 'Gấp · sắp có khách' : c.sameDay ? 'Gấp' : 'Cần dọn';
  const nextNote = c.next?.source === 'manual' ? String(c.next.description || '').trim() : '';
  return (
    <article className={`cl-card ${tone}`}>
      <div className="cl-card-head">
        <div>
          <h2>{c.room.name}</h2>
        </div>
        <span className={`cl-badge ${tone}`}>{badge}</span>
      </div>
      <ul className="cl-lines">
        <li><span aria-hidden="true">🧳</span>{c.custom ? (c.outTime ? <>Dọn lúc <b>{c.outTime}</b></> : 'Dọn trong ngày') : <>Khách trả phòng lúc <b>{c.outTime || '12:00'}</b></>}</li>
        <li>
          <span aria-hidden="true">🔑</span>
          {c.sameDay ? <>Khách mới đến lúc <b>{c.inTime}</b>{nextNights ? ` · ở ${nextNights} đêm` : ''}</>
            : c.next ? <>Khách sau đến {c.next.start === addDays(day, 1) ? 'ngày mai' : dm(c.next.start)}{nextNights ? ` · ở ${nextNights} đêm` : ''}</>
              : 'Chưa có khách mới'}
        </li>
      </ul>
      {(c.note || nextNote) && (
        <div className="cl-note">
          <NotebookPen size={18} />
          <p>{[c.note, nextNote].filter(Boolean).join('\n')}</p>
        </div>
      )}
      {c.done && c.doneInfo?.byName && <p className="cl-by">✓ {c.doneInfo.byName} đã dọn{c.doneInfo.at ? ` lúc ${new Date(c.doneInfo.at).toTimeString().slice(0, 5)}` : ''}</p>}
      <button className={`cl-done-btn ${c.done ? 'is-done' : ''}`} onClick={onToggle} aria-pressed={c.done}>
        {c.done ? 'Bấm nếu chưa dọn xong' : <><Check size={24} strokeWidth={3} /> Đã dọn xong</>}
      </button>
    </article>
  );
}

function TaskList() {
  const { state, dispatch, role, user } = useStore();
  const today = todayKey();
  const mine = visibleTasks(state.tasks, role, user);
  const roomName = useMemo(() => {
    const m = {};
    for (const l of state.locations) for (const r of l.rooms) m[r.id] = r.name;
    return m;
  }, [state.locations]);
  const list = [
    ...mine.filter((t) => !isRepeating(t) && !t.done && t.date && t.date < today).map((t) => ({ ...t, occ: t.date, iid: t.id, late: true })),
    ...taskInstances(mine, today, today),
    ...mine.filter((t) => !isRepeating(t) && !t.date && !t.done).map((t) => ({ ...t, occ: '', iid: t.id })),
  ];
  const upcoming = taskInstances(mine, addDays(today, 1), addDays(today, 3)).filter((t) => !t.done);
  const tick = (t) => { buzz(); dispatch({ type: 'TOGGLE_TASK', id: t.id, occ: t.occ, by: user?.id, byName: user?.name }); };
  const open = list.filter((t) => !t.done);
  return (
    <>
      <h1 className="cl-date">Việc khác hôm nay</h1>
      <p className="cl-sum">{open.length ? <>Còn <b>{open.length}</b> việc</> : 'Không còn việc nào'}</p>
      {list.length === 0 && <div className="cl-empty"><span>☕</span><b>Hôm nay không có việc khác</b><small>Admin giao việc thì sẽ hiện ở đây.</small></div>}
      <div className="cl-tasks">
        {[...open, ...list.filter((t) => t.done)].map((t) => <TaskRow key={`${t.iid}-${t.occ}`} t={t} room={roomName[t.roomId]} can={canTickTask(t, role, user)} onTick={() => tick(t)} />)}
      </div>
      {upcoming.length > 0 && (
        <>
          <h2 className="cl-sub">Sắp tới</h2>
          <div className="cl-tasks">
            {upcoming.map((t) => <TaskRow key={`${t.iid}-${t.occ}`} t={t} room={roomName[t.roomId]} can={false} when={dm(t.occ)} />)}
          </div>
        </>
      )}
    </>
  );
}

function TaskRow({ t, room, can, onTick, when }) {
  return (
    <div className={`cl-task ${t.done ? 'done' : ''} ${t.priority === 'urgent' ? 'urgent' : ''}`}>
      <button className={`cl-check ${t.done ? 'on' : ''}`} disabled={!can} onClick={onTick} aria-label={t.done ? 'Bỏ đánh dấu xong' : 'Đánh dấu xong'}>
        {t.done && <Check size={26} strokeWidth={3} />}
      </button>
      <div className="cl-task-body">
        <b>{t.title}</b>
        <small>
          {[when, t.late ? `Quá hạn ${dm(t.occ)}` : '', t.time, room, t.priority === 'urgent' ? 'Gấp' : ''].filter(Boolean).join(' · ')}
        </small>
        {t.desc && <p>{t.desc}</p>}
      </div>
    </div>
  );
}
