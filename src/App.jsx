import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, LayoutGrid, CalendarDays, ListChecks, Building2, BedDouble, ClipboardPlus, NotebookPen, Loader2, CloudOff, LogOut, RefreshCw, Revenue } from './lib/icons.jsx';
import { useFlipNav } from './lib/motion.js';
import { StoreProvider, useStore, demoState } from './lib/store.jsx';
import { useSession } from './lib/session.jsx';
import { FinanceProvider } from './lib/finance.jsx';
import { can } from './lib/perm.js';
import { todayKey } from './lib/dates.js';
import Login from './components/Login.jsx';
import WorkspacePicker from './components/WorkspacePicker.jsx';
import Onboarding from './components/Onboarding.jsx';
import Home from './components/Home.jsx';
import CalendarView from './components/CalendarView.jsx';
import Tasks from './components/Tasks.jsx';
import Places from './components/Places.jsx';
import Finance from './components/Finance.jsx';
import { BookingSheet } from './components/BookingSheet.jsx';
import { TaskSheet } from './components/TaskSheet.jsx';
import { Sheet, Toaster } from './components/ui.jsx';
import { LogoMark } from './components/Logo.jsx';

const TABS = [
  { id: 'home', label: 'Tổng quan', icon: LayoutGrid },
  { id: 'calendar', label: 'Lịch', icon: CalendarDays },
  { id: 'tasks', label: 'Task', icon: ListChecks },
  { id: 'finance', label: 'Tài chính', icon: Revenue, perm: 'finance' },
  { id: 'places', label: 'Cơ sở', icon: Building2 },
];

export default function App() {
  const s = useSession();
  const scope = useMemo(() => {
    if (s.session?.demo) return { cacheKey: 'hosty:demo', cloud: null, initial: demoState };
    if (s.token && s.workspace) {
      return { cacheKey: `hosty:data:${s.workspace.id}`, cloud: { token: s.token, ws: s.workspace.id }, onAuthError: s.logout };
    }
    return null;
  }, [s.session?.demo, s.token, s.workspace?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  let body;
  if (!s.session) body = <Login />;
  else if (!scope) body = <WorkspacePicker />;
  else {
    const user = s.session.demo ? { id: 'demo', name: 'Khách xem thử' } : s.user;
    body = (
      <StoreProvider key={scope.cacheKey} scope={scope} role={s.role} user={user}>
        <FinanceProvider enabled={can(s.role, 'finance')} cloud={scope.cloud}>
          <Workspace />
        </FinanceProvider>
      </StoreProvider>
    );
  }
  return <>{body}<Toaster /></>;
}

function Splash({ cloud, onLogout }) {
  const failed = cloud.status === 'offline' || cloud.status === 'error';
  return (
    <div className="splash">
      <LogoMark size={72} animated />
      {failed ? (
        <>
          <p className="splash-msg"><CloudOff size={18} /> {cloud.error || 'Không tải được dữ liệu'}</p>
          <div className="row gap8">
            <button className="btn primary" onClick={() => cloud.syncNow()}><RefreshCw size={16} /> Thử lại</button>
            <button className="btn ghost" onClick={onLogout}><LogOut size={16} /> Đăng xuất</button>
          </div>
        </>
      ) : (
        <p className="splash-msg"><Loader2 size={18} className="spin" /> Đang tải dữ liệu cơ sở…</p>
      )}
    </div>
  );
}

function NotSetup() {
  const { workspace, logout, workspaces, selectWs } = useSession();
  const { cloud } = useStore();
  return (
    <div className="splash">
      <LogoMark size={64} />
      <h2>{workspace?.name}</h2>
      <p className="splash-msg center">Cơ sở chưa được admin thiết lập phòng và lịch.<br />Khi admin thiết lập xong, dữ liệu sẽ tự xuất hiện ở đây.</p>
      <div className="row gap8 wrap">
        <button className="btn primary" onClick={() => cloud.syncNow()}><RefreshCw size={16} className={cloud.status === 'syncing' ? 'spin' : ''} /> Kiểm tra lại</button>
        {workspaces.length > 1 && <button className="btn ghost" onClick={() => selectWs(null)}>Đổi cơ sở</button>}
        <button className="btn ghost" onClick={logout}><LogOut size={16} /> Đăng xuất</button>
      </div>
    </div>
  );
}

function Workspace() {
  const { state, cloud, role } = useStore();
  const s = useSession();
  const [tab, setTab] = useState('home');
  const [calFocus, setCalFocus] = useState({ date: todayKey(), selected: null, nonce: 0 });
  const [createOpen, setCreateOpen] = useState(false);
  const [booking, setBooking] = useState(null); // {mode:'new'|'view', data}
  const [task, setTask] = useState(null);
  const [editing, setEditing] = useState(false);
  // inSetup: đang làm các câu hỏi thiết lập trên máy này (giữ màn thiết lập tới khi bấm "Vào ứng dụng")
  const [inSetup, setInSetup] = useState(false);
  const navRef = useRef(null);
  const showMain = cloud.loaded && state.setupDone && !inSetup && !editing;
  const blob = useFlipNav(navRef, tab, showMain);

  useEffect(() => { if (cloud.loaded && !state.setupDone && can(role, 'setup')) setInSetup(true); }, [cloud.loaded, state.setupDone, role]);
  useEffect(() => { window.scrollTo(0, 0); }, [tab]);

  if (!cloud.loaded) return <Splash cloud={cloud} onLogout={s.logout} />;

  if (!state.setupDone && !can(role, 'setup')) return <NotSetup />;

  if (!state.setupDone || inSetup || editing) {
    return (
      <Onboarding
        editing={editing}
        initialName={s.workspace?.name || ''}
        onDone={() => { setEditing(false); setInSetup(false); setTab('home'); }}
        onCancel={editing ? () => setEditing(false) : (s.workspaces.length > 1 ? () => s.selectWs(null) : null)}
      />
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
  const canCreate = can(role, 'booking');

  return (
    <div className="app">
      <main key={tab} className={`page page-${tab}`}>
        {tab === 'home' && <Home api={api} />}
        {tab === 'calendar' && <CalendarView api={api} focus={calFocus} />}
        {tab === 'tasks' && <Tasks api={api} />}
        {tab === 'finance' && can(role, 'finance') && <Finance api={api} />}
        {tab === 'places' && <Places api={api} />}
      </main>

      <nav className={`bottom-nav ${can(role, 'finance') ? 'crowded' : ''}`} aria-label="Điều hướng" ref={navRef}>
        {blob && (
          <span
            className={`nav-blob ${blob.animate ? (blob.dir > 0 ? 'to-right' : 'to-left') : ''}`}
            style={{ left: blob.left, right: blob.right }}
            aria-hidden="true"
          />
        )}
        {canCreate && <button className="nav-plus" data-flip="plus" onClick={() => setCreateOpen(true)} aria-label="Tạo mới"><Plus size={22} /></button>}
        {TABS.filter((t) => !t.perm || can(role, t.perm)).map(({ id, label, icon: Icon }) => (
          <button key={id} data-flip={id} className={`nav-item ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)} aria-label={label} aria-current={tab === id ? 'page' : undefined}>
            <span className="nav-ico"><Icon size={19} /></span>
            {tab === id && <span className="nav-label">{label}</span>}
          </button>
        ))}
      </nav>

      {canCreate && (
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
      )}

      {booking && <BookingSheet {...booking} onClose={() => setBooking(null)} />}
      {task && <TaskSheet task={task} onClose={() => setTask(null)} />}
    </div>
  );
}
