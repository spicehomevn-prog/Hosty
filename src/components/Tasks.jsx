import { useMemo, useState } from 'react';
import { Check, Plus, CalendarDays, DoorOpen, Sparkles, ListChecks, UserRound, Clock, RefreshCw, Bell } from '../lib/icons.jsx';
import { can, visibleTasks, canTickTask } from '../lib/perm.js';
import { useMembers } from '../lib/members.js';
import { useStore } from '../lib/store.jsx';
import { getBookings, getCleanings, roomIndex } from '../lib/derive.js';
import { todayKey, startOfWeek, addDays, dm } from '../lib/dates.js';
import { ProgressRing } from './ProgressRing.jsx';
import { PRIORITIES } from './TaskSheet.jsx';
import { taskInstances, currentInstance, isRepeating, repeatLabel, remindLabel } from '../lib/tasks.js';

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
  const todayTasks = taskInstances(tasks, today, today);
  const weekTasks = taskInstances(tasks, ws, addDays(ws, 6));
  // task lặp lại: hiện lần hôm nay hoặc lần kế tiếp
  const current = tasks.map((t) => currentInstance(t, today)).filter(Boolean);
  const ratio = (list) => (list.length ? Math.round((list.filter((x) => x.done).length / list.length) * 100) : 0);

  const list = current
    .filter((t) => (filter === 'open' ? !t.done : filter === 'done' ? t.done : filter === 'today' ? t.occ === today : true))
    .sort((a, b) => Number(a.done) - Number(b.done) || (a.occ || '9').localeCompare(b.occ || '9') || (a.time || '99').localeCompare(b.time || '99'));

  const summary = [
    { tone: 'violet', title: 'Task hôm nay', list: todayTasks, icon: ListChecks },
    { tone: 'pink', title: 'Dọn phòng hôm nay', list: todayClean, icon: Sparkles },
    { tone: 'yellow', title: 'Task tuần này', list: weekTasks, icon: CalendarDays },
    { tone: 'blue', title: 'Dọn phòng tuần này', list: weekClean, icon: Sparkles },
  ];

  return (
    <div className="tasks">
      <header className="page-head rise">
        <div><h1>{canEdit ? 'Công việc' : 'Việc của tôi'}</h1><p className="sub">{current.filter((t) => !t.done).length} task chưa hoàn thành</p></div>
        {canEdit && <button className="icon-btn add-round" onClick={() => api.newTask()} aria-label="Thêm task"><Plus size={22} /></button>}
      </header>

      <h2 className="section-title">Tiến độ</h2>
      <div className="active-cards scroll-x stagger">
        {summary.map((s) => <ProgressTile key={s.title} s={s} pct={ratio(s.list)} />)}
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
            <div key={t.iid} className={`task-card p-${t.priority} ${t.done ? 'done' : ''}`}>
              <button className={`check ${t.done ? 'on' : ''}`} disabled={!canTickTask(t, role, user)} onClick={() => dispatch({ type: 'TOGGLE_TASK', id: t.id, occ: t.occ, by: user?.id, byName: user?.name })} aria-label={t.done ? 'Đánh dấu chưa xong' : 'Đánh dấu hoàn thành'}>
                {t.done && <Check size={14} strokeWidth={3} />}
              </button>
              <button className="task-body" onClick={() => canEdit && api.editTask(t)}>
                <b>{t.title}</b>
                {t.desc && <span>{t.desc}</span>}
                <span className="task-tags">
                  {t.occ && <em className={`tag ${!t.done && t.occ < today ? 'late' : ''}`}><CalendarDays size={12} />{t.occ === today ? 'Hôm nay' : dm(t.occ)}</em>}
                  {t.time && <em className="tag"><Clock size={12} />{t.time}</em>}
                  {isRepeating(t) && <em className="tag rep"><RefreshCw size={12} />{repeatLabel(t)}</em>}
                  {t.remind != null && <em className="tag"><Bell size={12} />{remindLabel(t.remind)}</em>}
                  {room && <em className="tag"><DoorOpen size={12} />{room.name}</em>}
                  <em className={`tag pr-${t.priority}`}>{pr.label}</em>
                  {t.assignee && <em className="tag"><UserRound size={12} />{t.assignee === user?.id ? 'Giao cho tôi' : members.find((m) => m.id === t.assignee)?.name || 'Đã giao'}</em>}
                  {t.done && (t.doneInfo?.byName || t.doneByName) && <em className="tag"><Check size={12} />{t.doneInfo?.byName || t.doneByName}</em>}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Ô vuông tiến độ: vòng tròn chạy lên khi xuất hiện, hoàn thành thì vòng đầy + dấu ✓ + hiệu ứng */
function ProgressTile({ s, pct }) {
  const [doneVis, setDoneVis] = useState(false);
  const n = s.list.length;
  const ok = s.list.filter((x) => x.done).length;
  const done = n > 0 && ok === n;
  return (
    <div className={`active-card ring-card tone-${s.tone} ${doneVis ? 'done' : ''}`}>
      <div className="ac-top">
        <s.icon size={18} />
        <ProgressRing pct={pct} done={done} empty={!n} size={58} stroke={6} className="ink" onShown={setDoneVis} />
      </div>
      <b>{s.title}</b>
      <div className="ac-foot">
        <span>{n ? `${ok}/${n} xong` : 'Không có việc'}</span>
        {done && <span className="ac-done">Hoàn thành</span>}
      </div>
    </div>
  );
}
