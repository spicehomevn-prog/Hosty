import { useEffect, useRef, useState } from 'react';
import { useFlipNav } from './lib/motion.js';
import { Plus, LayoutGrid, CalendarDays, ListChecks, Building2, BedDouble, ClipboardPlus, NotebookPen } from 'lucide-react';
import { useStore } from './lib/store.jsx';
import { applyFont } from './lib/fonts.js';
import { todayKey } from './lib/dates.js';
import Onboarding from './components/Onboarding.jsx';
import Home from './components/Home.jsx';
import CalendarView from './components/CalendarView.jsx';
import Tasks from './components/Tasks.jsx';
import Places from './components/Places.jsx';
import { BookingSheet } from './components/BookingSheet.jsx';
import { TaskSheet } from './components/TaskSheet.jsx';
import { Sheet, Toaster } from './components/ui.jsx';

const TABS = [
  { id: 'home', label: 'Tổng quan', icon: LayoutGrid },
  { id: 'calendar', label: 'Lịch', icon: CalendarDays },
  { id: 'tasks', label: 'Task', icon: ListChecks },
  { id: 'places', label: 'Cơ sở', icon: Building2 },
];

export default function App() {
  const { state } = useStore();
  const [tab, setTab] = useState('home');
  const [calFocus, setCalFocus] = useState({ date: todayKey(), selected: null, nonce: 0 });
  const [createOpen, setCreateOpen] = useState(false);
  const [booking, setBooking] = useState(null); // {mode:'new'|'view', data}
  const [task, setTask] = useState(null);
  const [editing, setEditing] = useState(false);
  const [inSetup, setInSetup] = useState(!state.setupDone);
  const navRef = useRef(null);
  const showMain = state.setupDone && !inSetup && !editing;
  const blob = useFlipNav(navRef, tab, showMain);

  useEffect(() => { if (!state.setupDone) setInSetup(true); }, [state.setupDone]);

  useEffect(() => { applyFont(state.settings.font || 'Be Vietnam Pro'); }, [state.settings.font]);
  useEffect(() => { window.scrollTo(0, 0); }, [tab]);

  if (!state.setupDone || inSetup || editing) {
    return (
      <>
        <Onboarding editing={editing} onDone={() => { setEditing(false); setInSetup(false); setTab('home'); }} onCancel={editing ? () => setEditing(false) : null} />
        <Toaster />
      </>
    );
  }

  const openDay = (date) => { setCalFocus({ date, selected: date, nonce: Date.now() }); setTab('calendar'); };
  const api = {
    openDay,
    openBooking: (b) => setBooking({ mode: 'view', data: b }),
    newBooking: (preset) => setBooking({ mode: 'new', data: preset || {} }),
    newTask: (preset) => setTask(preset || {}),
    editTask: (t) => setTask(t),
    editSetup: () => setEditing(true),
    goto: setTab,
  };

  return (
    <div className="app">
      <main key={tab} className={`page page-${tab}`}>
        {tab === 'home' && <Home api={api} />}
        {tab === 'calendar' && <CalendarView api={api} focus={calFocus} />}
        {tab === 'tasks' && <Tasks api={api} />}
        {tab === 'places' && <Places api={api} />}
      </main>

      <nav className="bottom-nav" aria-label="Điều hướng" ref={navRef}>
        {blob && (
          <span
            className={`nav-blob ${blob.animate ? (blob.dir > 0 ? 'to-right' : 'to-left') : ''}`}
            style={{ left: blob.left, right: blob.right }}
            aria-hidden="true"
          />
        )}
        <button className="nav-plus" data-flip="plus" onClick={() => setCreateOpen(true)} aria-label="Tạo mới"><Plus size={22} /></button>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} data-flip={id} className={`nav-item ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)} aria-label={label} aria-current={tab === id ? 'page' : undefined}>
            <span className="nav-ico"><Icon size={19} /></span>
            {tab === id && <span className="nav-label">{label}</span>}
          </button>
        ))}
      </nav>

      <Sheet open={createOpen} onClose={() => setCreateOpen(false)} title="Tạo mới">
        <div className="create-grid">
          <button className="create-tile violet" onClick={() => { setCreateOpen(false); api.newBooking(); }}>
            <span className="tile-ico"><BedDouble size={22} /></span><b>Đặt phòng</b><small>Khách đặt trực tiếp</small>
          </button>
          <button className="create-tile yellow" onClick={() => { setCreateOpen(false); api.newTask(); }}>
            <span className="tile-ico"><ClipboardPlus size={22} /></span><b>Task</b><small>Việc cần làm</small>
          </button>
          <button className="create-tile pink" onClick={() => { setCreateOpen(false); openDay(todayKey()); }}>
            <span className="tile-ico"><NotebookPen size={22} /></span><b>Ghi chú</b><small>Cho hôm nay</small>
          </button>
        </div>
      </Sheet>

      {booking && <BookingSheet {...booking} onClose={() => setBooking(null)} />}
      {task && <TaskSheet task={task} onClose={() => setTask(null)} />}
      <Toaster />
    </div>
  );
}
