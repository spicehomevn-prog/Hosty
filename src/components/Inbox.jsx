import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, ListChecks, LayoutGrid, DoorOpen, KeyRound, Loader2, ChevronRight } from '../lib/icons.jsx';
import { useSession } from '../lib/session.jsx';
import { todayKey, addDays, dm, wdShort } from '../lib/dates.js';
import { Sheet } from './ui.jsx';
import { LockBadge, openUpgrade } from './Upgrade.jsx';

/**
 * Hộp thông báo (nút chuông ở đầu Tổng quan): gom các thông báo đẩy đã gửi tới người này
 * (tổng quan 8:00, trả / nhận phòng, nhắc task) trong 14 ngày. Máy chủ lưu ở notify/inbox/<uid>.json.
 * "Đã xem" lưu trên máy (localStorage) – không tốn thao tác ghi máy chủ.
 */
const KIND = {
  daily: { Icon: LayoutGrid, tone: 'peach', label: 'Tổng quan' },
  checkout: { Icon: DoorOpen, tone: 'pink', label: 'Trả phòng' },
  checkin: { Icon: KeyRound, tone: 'violet', label: 'Nhận phòng' },
  task: { Icon: ListChecks, tone: 'blue', label: 'Task' },
};
const vnDay = (ts) => new Date(ts + 7 * 3600e3).toISOString().slice(0, 10);
const vnTime = (ts) => new Date(ts + 7 * 3600e3).toISOString().slice(11, 16);
const seenKey = (uid, ws) => `hosty:inbox-seen:${uid}:${ws}`;
const readSeen = (k) => { try { return Number(localStorage.getItem(k)) || 0; } catch { return 0; } };
const writeSeen = (k, v) => { try { localStorage.setItem(k, String(v)); } catch { /* chế độ riêng tư */ } };

function demoItems() {
  const now = Date.now();
  const at = (minAgo) => now - minAgo * 60000;
  return [
    { id: 'd1', at: at(25), kind: 'checkin', title: '🔑 Phòng Đồi Thông nhận phòng lúc 14:00', body: 'Còn 1 giờ · Airbnb', url: '/?tab=home' },
    { id: 'd2', at: at(140), kind: 'checkout', title: '🧳 Phòng 102 trả phòng lúc 12:00', body: 'Còn 1 giờ · Booking.com', url: '/?tab=home' },
    { id: 'd3', at: at(200), kind: 'task', title: '⏰ Giặt ga phòng 101', body: 'Còn 15 phút · 07:30', url: '/?tab=tasks' },
    { id: 'd4', at: at(330), kind: 'daily', title: '☀️ Chào buổi sáng, Lan', body: 'Hôm nay có 2 lượt trả phòng, 1 lượt nhận phòng và 1 khoản phải thu tiền phòng (800k).', url: '/?tab=home' },
    { id: 'd5', at: at(60 * 24 + 300), kind: 'checkout', title: '🧳 Phòng Sương Mai trả phòng lúc 11:00', body: 'Còn 1 giờ · Trực tiếp · Chị Lan', url: '/?tab=home' },
    { id: 'd6', at: at(60 * 24 + 330), kind: 'daily', title: '☀️ Chào buổi sáng, Lan', body: 'Hôm nay có 1 lượt trả phòng, 2 lượt nhận phòng và 0 khoản phải thu tiền phòng.', url: '/?tab=home' },
  ];
}

export function useInbox() {
  const s = useSession();
  const ws = s.workspace?.id;
  const uid = s.user?.id || 'demo';
  const demo = s.role === 'demo';
  const locked = !demo && s.plan?.trial;
  const key = seenKey(uid, ws);
  const [items, setItems] = useState(() => (demo ? demoItems() : null));
  const [seen, setSeen] = useState(() => (demo ? Date.now() - 90 * 60000 : readSeen(key)));
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const last = useRef(0);

  const load = useCallback(async (force = false) => {
    if (demo || locked || !ws) return;
    if (!force && Date.now() - last.current < 60000) return; // tối đa 1 lần / phút
    last.current = Date.now();
    setLoading(true);
    try { const r = await s.call(`/api/notify?ws=${encodeURIComponent(ws)}&inbox=1`); setItems(r.items || []); setErr(''); } catch (e) { setErr(e.message); }
    setLoading(false);
  }, [demo, locked, ws]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load(true);
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    const onMsg = (e) => { if (e.data?.type === 'push') load(true); };
    document.addEventListener('visibilitychange', onVis);
    navigator.serviceWorker?.addEventListener('message', onMsg);
    return () => { document.removeEventListener('visibilitychange', onVis); navigator.serviceWorker?.removeEventListener('message', onMsg); };
  }, [load]);

  const unread = (items || []).filter((x) => x.at > seen).length;
  const markSeen = () => { const t = Date.now(); setSeen(t); if (!demo) writeSeen(key, t); };
  return { items, unread, seen, loading, err, load, markSeen, locked };
}

export function InboxButton({ api }) {
  const box = useInbox();
  const [open, setOpen] = useState(false);
  const [seenAt, setSeenAt] = useState(0); // mốc "đã xem" lúc mở – để vẫn tô các mục mới trong lần mở này
  const show = () => {
    if (box.locked) { openUpgrade('push'); return; }
    setSeenAt(box.seen); setOpen(true); box.markSeen(); box.load(true);
  };
  return (
    <>
      <button className="icon-btn inbox-btn" onClick={show} aria-label={box.unread ? `Thông báo, ${box.unread} mới` : 'Thông báo'}>
        <Bell size={19} />
        {box.unread > 0 && <span className="inbox-dot">{box.unread > 9 ? '9+' : box.unread}</span>}
        {box.locked && <LockBadge />}
      </button>
      {open && <InboxSheet box={box} seenAt={seenAt} api={api} onClose={() => { box.markSeen(); setOpen(false); }} />}
    </>
  );
}

function InboxSheet({ box, seenAt, api, onClose }) {
  const { items, loading, err } = box;
  const today = todayKey();
  const groups = [];
  for (const it of items || []) {
    const d = vnDay(it.at);
    let g = groups[groups.length - 1];
    if (!g || g.day !== d) { g = { day: d, list: [] }; groups.push(g); }
    g.list.push(it);
  }
  const dayLabel = (d) => (d === today ? 'Hôm nay' : d === addDays(today, -1) ? 'Hôm qua' : `${wdShort(d)}, ${dm(d)}`);
  const go = (it) => {
    onClose();
    if (it.kind === 'task' || /tab=tasks/.test(it.url || '')) api.goto('tasks');
    else if (it.kind === 'checkin' || it.kind === 'checkout') api.openDay(vnDay(it.at));
    else api.goto('home');
  };
  return (
    <Sheet open onClose={onClose} title="Thông báo">
      {items == null && loading && <p className="muted inbox-empty"><Loader2 size={16} className="spin" /> Đang tải…</p>}
      {err && <p className="form-error">{err}</p>}
      {items && !items.length && (
        <div className="inbox-empty">
          <span className="inbox-empty-ico"><Bell size={26} /></span>
          <b>Chưa có thông báo nào</b>
          <small>Thông báo tổng quan 8:00, trả / nhận phòng và nhắc task đã gửi tới bạn sẽ hiện ở đây (giữ 14 ngày). Bật thông báo ở <b>Cơ sở → Thông báo</b>.</small>
        </div>
      )}
      {groups.map((g) => (
        <section key={g.day} className="inbox-group">
          <h4>{dayLabel(g.day)}</h4>
          {g.list.map((it) => {
            const k = KIND[it.kind] || KIND.daily;
            return (
              <button key={it.id} className={`inbox-item ${it.at > seenAt ? 'new' : ''}`} onClick={() => go(it)}>
                <span className={`inbox-ico ${k.tone}`}><k.Icon size={18} /></span>
                <span className="inbox-text">
                  <b>{it.title}</b>
                  {it.body && <small>{it.body}</small>}
                  <em>{k.label} · {vnTime(it.at)}</em>
                </span>
                <ChevronRight size={16} className="inbox-go" />
              </button>
            );
          })}
        </section>
      ))}
    </Sheet>
  );
}
