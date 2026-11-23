import { useMemo, useState } from 'react';
import { RefreshCw, Settings2, LogIn, Sparkles, BedDouble, ClipboardPlus, NotebookPen, CalendarRange, AlertTriangle, Check } from '../lib/icons.jsx';
import { useStore } from '../lib/store.jsx';
import { getBookings, getCleanings, arrivalsOn, occupiedOn, allRooms, roomIndex } from '../lib/derive.js';
import { todayKey, longDate, addDays, dm, timeAgo, wdShort } from '../lib/dates.js';
import { Progress } from './ui.jsx';
import { LogoMark } from './Logo.jsx';
import { useCountUp } from '../lib/motion.js';
import { SyncStatus } from './Account.jsx';
import { useSession } from '../lib/session.jsx';
import { can, visibleTasks, canTickTask } from '../lib/perm.js';
import { ArrowLeftRight } from '../lib/icons.jsx';
import { CleaningCard } from './CleaningPanel.jsx';
import OccupancySheet from './OccupancySheet.jsx';
import { ChevronRight, Revenue, Payments } from '../lib/icons.jsx';
import { useFinance } from '../lib/finance.jsx';
import { ledger, monthSummary, collectStats } from '../lib/fin.js';
import { ProgressRing } from './ProgressRing.jsx';
import { fmtShort, fmtVND } from '../lib/money.js';
import { Sheet } from './ui.jsx';
import { platformColor } from '../lib/store.jsx';

export default function Home({ api }) {
  const { state, dispatch, sync, syncing, cloud, role, user } = useStore();
  const { workspaces, selectWs } = useSession();
  const today = todayKey();
  const [occOpen, setOccOpen] = useState(false);
  const bookings = useMemo(() => getBookings(state), [state]);
  const idx = useMemo(() => roomIndex(state), [state]);
  const rooms = allRooms(state);
  const arrivals = arrivalsOn(bookings, today);
  const cleanings = getCleanings(state, bookings, today, today);
  const occupied = new Set(occupiedOn(bookings, today).map((b) => b.roomId)).size;
  const occPct = rooms.length ? Math.round((occupied / rooms.length) * 100) : 0;
  const failed = state.calendars.filter((c) => state.syncInfo[c.id] && !state.syncInfo[c.id].ok);
  const todayTasks = visibleTasks(state.tasks, role, user).filter((t) => t.date === today || (!t.done && t.date && t.date < today));
  const nArr = useCountUp(arrivals.length);
  const nClean = useCountUp(cleanings.length);
  const nOcc = useCountUp(occPct);
  const upcoming = bookings.filter((b) => !b.blocked && b.start > today && b.start <= addDays(today, 7)).slice(0, 6);

  return (
    <div className="home">
      <header className="home-top rise" style={{ '--i': 0 }}>
        <div className="hello">
          <LogoMark size={48} />
          <span>Xin chào{user?.name ? `, ${user.name}` : ''}</span>
        </div>
        <div className="row gap8">
          <button className="icon-btn" onClick={() => { sync(); cloud.syncNow(); }} disabled={syncing || cloud.status === 'syncing'} aria-label="Đồng bộ"><RefreshCw size={19} className={syncing || cloud.status === 'syncing' ? 'spin' : ''} /></button>
          <button className="icon-btn" onClick={() => api.goto('places')} aria-label="Cài đặt"><Settings2 size={19} /></button>
        </div>
      </header>

      <h1 className="home-title rise" style={{ '--i': 1 }}>{state.property.name}</h1>
      <p className="sub rise" style={{ '--i': 2 }}>Hôm nay {longDate(today)}</p>
      <div className="home-sync rise" style={{ '--i': 2 }}>
        <SyncStatus compact />
        {workspaces.length > 1 && <button className="sync-pill" onClick={() => selectWs(null)}><ArrowLeftRight size={14} /><span>Đổi cơ sở</span></button>}
      </div>

      <div className="hero-cards rise" style={{ '--i': 3 }}>
        <button className="hero violet" onClick={() => api.openDay(today)}>
          <span className="hero-ico"><LogIn size={18} /></span>
          <span className="hero-label">Nhận phòng hôm nay</span>
          <b className="hero-num">{nArr} <small>lượt</small></b>
          <span className="hero-deco" aria-hidden="true" />
        </button>
        <button className="hero yellow" onClick={() => api.openDay(today)}>
          <span className="hero-ico"><Sparkles size={18} /></span>
          <span className="hero-label">Dọn phòng hôm nay</span>
          <b className="hero-num">{nClean} <small>phòng</small></b>
          <span className="hero-deco" aria-hidden="true" />
        </button>
      </div>
      <FinanceTiles state={state} bookings={bookings} idx={idx} api={api} />

      <button className="occ-card rise" style={{ '--i': 4 }} onClick={() => setOccOpen(true)} aria-haspopup="dialog">
        <div>
          <b>Công suất hôm nay</b>
          <span className="muted">{occupied}/{rooms.length} phòng có khách · {rooms.length - occupied} trống</span>
        </div>
        <div className="occ-right">
          <Progress value={occPct} />
          <b>{nOcc}%</b>
          <ChevronRight size={18} className="occ-chev" />
        </div>
      </button>
      <OccupancySheet open={occOpen} onClose={() => setOccOpen(false)} day={today} bookings={bookings} api={api} />

      {failed.length > 0 && (
        <button className="alert" onClick={() => api.goto('places')}>
          <AlertTriangle size={18} />
          <span>{failed.length} lịch đồng bộ lỗi · {state.syncInfo[failed[0].id].error}</span>
        </button>
      )}

      <h2 className="section-title rise" style={{ '--i': 5 }}>Thao tác nhanh</h2>
      <div className="actions scroll-x stagger" style={{ '--i': 5 }}>
        {can(role, 'booking') && <button className="action" onClick={() => api.newBooking()}><span className="aico pink"><BedDouble size={22} /></span>Đặt phòng</button>}
        {can(role, 'task.create') && <button className="action" onClick={() => api.newTask()}><span className="aico violet"><ClipboardPlus size={22} /></span>Thêm task</button>}
        <button className="action" onClick={() => api.openDay(today)}><span className="aico blue"><NotebookPen size={22} /></span>{can(role, 'note.edit') ? 'Ghi chú' : 'Hôm nay'}</button>
        {!can(role, 'task.create') && <button className="action" onClick={() => api.goto('tasks')}><span className="aico violet"><Check size={22} /></span>Task của tôi</button>}
        <button className="action" onClick={() => { dispatch({ type: 'SETTINGS', patch: { calView: 'week' } }); api.goto('calendar'); }}><span className="aico yellow"><CalendarRange size={22} /></span>Lịch tuần</button>
      </div>

      <div className="section-row rise" style={{ '--i': 6 }}>
        <h2 className="section-title">Dọn phòng hôm nay</h2>
        <button className="link" onClick={() => api.openDay(today)}>Xem lịch</button>
      </div>
      <div className="clean-list stagger" style={{ '--i': 6 }}>
        {cleanings.length === 0
          ? <div className="empty-card"><Sparkles size={20} /><p>Hôm nay không có phòng nào cần dọn.</p></div>
          : cleanings.map((c) => <CleaningCard key={c.id} c={c} />)}
      </div>

      {todayTasks.length > 0 && (
        <>
          <div className="section-row">
            <h2 className="section-title">Task hôm nay</h2>
            <button className="link" onClick={() => api.goto('tasks')}>Xem tất cả</button>
          </div>
          <div className="mini-tasks stagger" style={{ '--i': 7 }}>
            {todayTasks.slice(0, 4).map((t) => (
              <div key={t.id} className={`mini-task ${t.done ? 'done' : ''}`}>
                <button className={`check ${t.done ? 'on' : ''} p-${t.priority}`} disabled={!canTickTask(t, role, user)} onClick={() => dispatch({ type: 'TOGGLE_TASK', id: t.id, by: user?.id, byName: user?.name })} aria-label="Hoàn thành">{t.done && <Check size={14} strokeWidth={3} />}</button>
                <button className="mini-task-body" onClick={() => (can(role, 'task.create') ? api.editTask(t) : api.goto('tasks'))}>
                  <b>{t.title}</b>
                  {t.date < today && !t.done && <small className="overdue">Quá hạn {dm(t.date)}</small>}
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <h2 className="section-title">Khách sắp đến (7 ngày)</h2>
      <div className="upcoming stagger" style={{ '--i': 8 }}>
        {upcoming.length === 0 && <p className="muted tiny">Chưa có khách nào trong 7 ngày tới.</p>}
        {upcoming.map((b) => (
          <button key={b.id} className="up-item" onClick={() => api.openBooking(b)}>
            <span className="up-date"><small>{wdShort(b.start)}</small><b>{b.start.slice(8)}</b></span>
            <span className="arr-main"><b>{idx[b.roomId]?.room.name}</b><small>{b.platform} · {dm(b.start)} → {dm(b.end)}</small></span>
            <span className="pdot lg" style={{ background: b.color }} />
          </button>
        ))}
      </div>
      <p className="tiny muted center">Lịch iCal tải lần cuối: {timeAgo(state.lastSync)}</p>
    </div>
  );
}

// Số tiền gọn cho ô vuông: đơn vị cố định theo giá trị cuối để số đếm lên không đổi đơn vị giữa chừng
const moneyUnit = (v) => (v >= 1e9 ? { d: 1e9, u: 'tỷ' } : v >= 1e6 ? { d: 1e6, u: 'tr' } : v >= 1e3 ? { d: 1e3, u: 'k' } : { d: 1, u: '₫' });
const tenths = (n) => (n / 10).toLocaleString('vi-VN', { maximumFractionDigits: 1 });

/** Owner / admin: 2 ô vuông Doanh thu tháng này + Còn phải thu (vòng tiến độ thu tiền) */
function FinanceTiles({ state, bookings, idx, api }) {
  const finance = useFinance();
  const [open, setOpen] = useState(false);
  const [doneVis, setDoneVis] = useState(false); // nền xanh chỉ hiện khi vòng tròn đã chạy xong (không bị sheet che)
  const today = todayKey();
  const m = today.slice(0, 7);
  const data = useMemo(() => {
    if (!finance) return null;
    const { items } = ledger(state, bookings, finance.fin);
    const due = items.filter((b) => b.price.due > 0).sort((a, b) => (a.start < b.start ? -1 : 1));
    return { sum: monthSummary(items, finance.fin, m), col: collectStats(items, m), due };
  }, [finance, state, bookings, m]);
  const ru = moneyUnit(data?.sum.revenueTotal || 0);
  const du = moneyUnit(data?.col.due || 0);
  const nRev = useCountUp(Math.round(((data?.sum.revenueTotal || 0) / ru.d) * 10), 900);
  const nDue = useCountUp(Math.round(((data?.col.due || 0) / du.d) * 10), 900);
  if (!data) return null;
  const { sum, col, due } = data;
  const late = due.filter((b) => b.end <= today).length;
  return (
    <>
      <div className="hero-cards rise" style={{ '--i': 3 }}>
        <button className="hero blue" onClick={() => api.goto('finance')}>
          <span className="hero-ico"><Revenue size={18} /></span>
          <span className="hero-label">Doanh thu tháng này</span>
          <b className="hero-num">{tenths(nRev)} <small>{ru.u}</small></b>
          <span className="hero-sub">Lợi nhuận {fmtShort(sum.profit)}</span>
          <span className="hero-deco" aria-hidden="true" />
        </button>
        <button className={`hero due pink ${doneVis ? 'done' : ''}`} onClick={() => (due.length ? setOpen(true) : api.goto('finance'))}>
          <ProgressRing pct={col.pct} done={col.done} onShown={setDoneVis} />
          <span className="hero-label">{col.done ? 'Đã thu đủ' : 'Còn phải thu'}</span>
          <b className="hero-num">{col.done ? <>0 <small>₫</small></> : <>{tenths(nDue)} <small>{du.u}</small></>}</b>
          <span className="hero-sub">
            {col.done
              ? (col.count ? `${col.count} khách · tháng này` : 'Không có khoản cần thu')
              : `Đã thu ${col.pct}% · ${col.dueCount} khách${late ? ` · ${late} đã trả phòng` : ''}`}
          </span>
          <span className="hero-deco" aria-hidden="true" />
        </button>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title="Còn phải thu"
        footer={<button className="btn ghost block" onClick={() => { setOpen(false); api.goto('finance'); }}>Xem trong Tài chính</button>}>
        <div className="due-head"><span>{due.length} khách đặt trực tiếp</span><b>{fmtVND(due.reduce((a, b) => a + b.price.due, 0))}</b></div>
        <div className="fin-list">
          {due.map((b) => {
            const out = b.end <= today; const inNow = b.start <= today && b.end > today;
            return (
              <button key={b.id} className="fin-row due-row" onClick={() => { setOpen(false); api.openBooking(b); }}>
                <span className="fin-bar" style={{ background: platformColor(b.platform) }} />
                <span className="arr-main">
                  <b>{idx[b.roomId]?.room.name || 'Phòng'}{b.summary ? ` · ${b.summary}` : ''}</b>
                  <small>{dm(b.start)} → {dm(b.end)} · tổng {fmtVND(b.price.total)}{b.price.deposit ? ` · đã cọc ${fmtShort(b.price.deposit)}` : ''}</small>
                </span>
                <span className="fin-amt">
                  <b className="due-amt">{fmtVND(b.price.due)}</b>
                  <small>{out ? 'đã trả phòng' : inNow ? 'đang ở' : `nhận ${dm(b.start)}`}</small>
                </span>
              </button>
            );
          })}
        </div>
      </Sheet>
    </>
  );
}
