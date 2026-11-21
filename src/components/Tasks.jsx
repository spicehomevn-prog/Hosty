import { useMemo, useState } from 'react';
import { Check, Plus, CalendarDays, DoorOpen, Sparkles, ListChecks, UserRound } from '../lib/icons.jsx';
import { can, visibleTasks, canTickTask } from '../lib/perm.js';
import { useMembers } from '../lib/members.js';
import { useStore } from '../lib/store.jsx';
import { getBookings, getCleanings, roomIndex } from '../lib/derive.js';
import { todayKey, startOfWeek, addDays, dm } from '../lib/dates.js';
import { Progress } from './ui.jsx';
import { PRIORITIES } from './TaskSheet.jsx';

const FILTERS = [
  { id: 'open', label: 'Chưa xong' },
  { id: 'today', label: 'Hôm nay' },
  { id: 'all', label: 'Tất cả' },
  { id: 'done', label: 'Đã xong' },
];

export default function Tasks({ api }) {
  const { state, dispatch, role, user } = useStore();
  const members = useMembers();
  const canEdit = can(role, 'task.create');
  const tasks = visibleTasks(state.tasks, role, user);
  const [filter, setFilter] = useState('open');
  const today = todayKey();
  const idx = useMemo(() => roomIndex(state), [state]);
  const bookings = useMemo(() => getBookings(state), [state]);
  const ws = startOfWeek(today);
  const weekClean = getCleanings(state, bookings, ws, addDays(ws, 6));
  const todayClean = weekClean.filter((c) => c.date === today);
  const todayTasks = tasks.filter((t) => t.date === today);
  const weekTasks = tasks.filter((t) => t.date >= ws && t.date <= addDays(ws, 6));
  const ratio = (list) => (list.length ? Math.round((list.filter((x) => x.done).length / list.length) * 100) : 0);

  const list = tasks
    .filter((t) => (filter === 'open' ? !t.done : filter === 'done' ? t.done : filter === 'today' ? t.date === today : true))
    .sort((a, b) => Number(a.done) - Number(b.done) || (a.date || '9').localeCompare(b.date || '9'));

  const summary = [
    { tone: 'violet', title: 'Task hôm nay', list: todayTasks, icon: ListChecks },
    { tone: 'pink', title: 'Dọn phòng hôm nay', list: todayClean, icon: Sparkles },
    { tone: 'yellow', title: 'Task tuần này', list: weekTasks, icon: CalendarDays },
    { tone: 'blue', title: 'Dọn phòng tuần này', list: weekClean, icon: Sparkles },
  ];

  return (
    <div className="tasks">
      <header className="page-head rise">
        <div><h1>{canEdit ? 'Công việc' : 'Việc của tôi'}</h1><p className="sub">{tasks.filter((t) => !t.done).length} task chưa hoàn thành</p></div>
        {canEdit && <button className="icon-btn" onClick={() => api.newTask()} aria-label="Thêm task"><Plus size={20} /></button>}
      </header>

      <h2 className="section-title">Tiến độ</h2>
      <div className="active-cards scroll-x stagger">
        {summary.map((s) => (
          <div key={s.title} className={`active-card tone-${s.tone}`}>
            <s.icon size={18} />
            <b>{s.title}</b>
            <div className="ac-foot"><span>{s.list.filter((x) => x.done).length}/{s.list.length}</span><span>{ratio(s.list)}%</span></div>
            <Progress value={ratio(s.list)} />
          </div>
        ))}
      </div>

      <div className="chips scroll-x">
        {FILTERS.map((f) => <button key={f.id} className={`chip ${filter === f.id ? 'on' : ''}`} onClick={() => setFilter(f.id)}>{f.label}</button>)}
      </div>

      <div className="task-list stagger" style={{ '--i': 2 }}>
        {list.length === 0 && <div className="empty-card"><ListChecks size={22} /><p>Không có task nào.</p></div>}
        {list.map((t) => {
          const room = idx[t.roomId]?.room;
          const pr = PRIORITIES.find((p) => p.id === t.priority) || PRIORITIES[0];
          return (
            <div key={t.id} className={`task-card p-${t.priority} ${t.done ? 'done' : ''}`}>
              <button className={`check ${t.done ? 'on' : ''}`} disabled={!canTickTask(t, role, user)} onClick={() => dispatch({ type: 'TOGGLE_TASK', id: t.id, by: user?.id, byName: user?.name })} aria-label={t.done ? 'Đánh dấu chưa xong' : 'Đánh dấu hoàn thành'}>
                {t.done && <Check size={14} strokeWidth={3} />}
              </button>
              <button className="task-body" onClick={() => canEdit && api.editTask(t)}>
                <b>{t.title}</b>
                {t.desc && <span>{t.desc}</span>}
                <span className="task-tags">
                  {t.date && <em className={`tag ${!t.done && t.date < today ? 'late' : ''}`}><CalendarDays size={12} />{t.date === today ? 'Hôm nay' : dm(t.date)}</em>}
                  {room && <em className="tag"><DoorOpen size={12} />{room.name}</em>}
                  <em className={`tag pr-${t.priority}`}>{pr.label}</em>
                  {t.assignee && <em className="tag"><UserRound size={12} />{t.assignee === user?.id ? 'Giao cho tôi' : members.find((m) => m.id === t.assignee)?.name || 'Đã giao'}</em>}
                  {t.done && t.doneByName && <em className="tag"><Check size={12} />{t.doneByName}</em>}
                </span>
              </button>
            </div>
          );
        })}
      </div>
      {canEdit && <button className="fab" onClick={() => api.newTask()} aria-label="Thêm task"><Plus size={24} /></button>}
    </div>
  );
}
