import { createContext, useContext, useEffect, useReducer, useCallback, useRef, useState } from 'react';
import { fetchCalendar } from './ical.js';
import { addDays, todayKey } from './dates.js';

const KEY = 'lichphong:v1';
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const PLATFORMS = [
  { name: 'Airbnb', color: '#EF4F7A' },
  { name: 'Booking.com', color: '#3D7CF5' },
  { name: 'Agoda', color: '#9A6BFF' },
  { name: 'Traveloka', color: '#1FA7D8' },
  { name: 'Expedia', color: '#22A779' },
  { name: 'Trực tiếp', color: '#F0A132' },
];
const EXTRA = ['#E86A4A', '#6C7BEA', '#C25BC9', '#3AA6A0', '#B98A2E'];
export function platformColor(name = '') {
  const p = PLATFORMS.find((x) => x.name.toLowerCase() === name.trim().toLowerCase());
  if (p) return p.color;
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return EXTRA[h % EXTRA.length];
}

export const LOCATION_EMOJI = ['🏡', '🌿', '🏝️', '🏙️', '⛰️', '🌸', '🏖️', '🌙'];

export const emptyState = () => ({
  version: 1,
  setupDone: false,
  property: { name: '' },
  locations: [],
  calendars: [],
  events: {},
  syncInfo: {},
  lastSync: 0,
  manual: [],
  overrides: {},
  notes: {},
  tasks: [],
  cleanDone: {},
  settings: { font: 'Be Vietnam Pro', calView: 'month' },
});

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...emptyState(), ...JSON.parse(raw) };
  } catch { /* noop */ }
  return emptyState();
}

function reducer(state, a) {
  switch (a.type) {
    case 'REPLACE': return { ...emptyState(), ...a.state };
    case 'SETUP': {
      // giữ lại dữ liệu đồng bộ của các lịch vẫn còn
      const ids = new Set(a.calendars.map((c) => c.id));
      const keep = (obj) => Object.fromEntries(Object.entries(obj).filter(([k]) => ids.has(k)));
      return {
        ...state,
        setupDone: true,
        property: a.property,
        locations: a.locations,
        calendars: a.calendars,
        events: keep(state.events),
        syncInfo: keep(state.syncInfo),
      };
    }
    case 'SYNC_RESULT': {
      const events = { ...state.events };
      const syncInfo = { ...state.syncInfo };
      for (const r of a.results) {
        if (r.ok) events[r.id] = r.events;
        syncInfo[r.id] = { at: Date.now(), ok: r.ok, error: r.error || '', count: r.ok ? r.events.length : syncInfo[r.id]?.count || 0 };
      }
      return { ...state, events, syncInfo, lastSync: Date.now() };
    }
    case 'SET_NOTE': {
      const notes = { ...state.notes };
      if (a.text.trim()) notes[a.date] = a.text; else delete notes[a.date];
      return { ...state, notes };
    }
    case 'TOGGLE_CLEAN': {
      const cleanDone = { ...state.cleanDone };
      if (cleanDone[a.id]) delete cleanDone[a.id]; else cleanDone[a.id] = Date.now();
      return { ...state, cleanDone };
    }
    case 'SAVE_TASK': {
      const exists = state.tasks.some((t) => t.id === a.task.id);
      return { ...state, tasks: exists ? state.tasks.map((t) => (t.id === a.task.id ? a.task : t)) : [a.task, ...state.tasks] };
    }
    case 'TOGGLE_TASK': return { ...state, tasks: state.tasks.map((t) => (t.id === a.id ? { ...t, done: !t.done } : t)) };
    case 'DELETE_TASK': return { ...state, tasks: state.tasks.filter((t) => t.id !== a.id) };
    case 'SAVE_MANUAL': {
      const exists = state.manual.some((m) => m.id === a.booking.id);
      return { ...state, manual: exists ? state.manual.map((m) => (m.id === a.booking.id ? a.booking : m)) : [...state.manual, a.booking] };
    }
    case 'DELETE_MANUAL': return { ...state, manual: state.manual.filter((m) => m.id !== a.id) };
    case 'SET_OVERRIDE': {
      const overrides = { ...state.overrides, [a.id]: { ...state.overrides[a.id], ...a.patch } };
      return { ...state, overrides };
    }
    case 'SETTINGS': return { ...state, settings: { ...state.settings, ...a.patch } };
    case 'RESET': return emptyState();
    default: return state;
  }
}

const Ctx = createContext(null);

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, load);
  const [syncing, setSyncing] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* noop */ }
  }, [state]);

  const sync = useCallback(async (calendars) => {
    const list = (calendars || stateRef.current.calendars).filter((c) => c.url && !c.demo);
    if (!list.length) return [];
    setSyncing(true);
    const results = await Promise.all(
      list.map(async (c) => {
        try { return { id: c.id, ok: true, events: await fetchCalendar(c.url) }; }
        catch (e) { return { id: c.id, ok: false, error: e.message }; }
      }),
    );
    dispatch({ type: 'SYNC_RESULT', results });
    setSyncing(false);
    return results;
  }, []);

  // Tự đồng bộ khi mở app nếu lần cuối > 30 phút
  useEffect(() => {
    if (state.setupDone && Date.now() - (state.lastSync || 0) > 30 * 60 * 1000) sync();
    const t = setInterval(() => { if (stateRef.current.setupDone) sync(); }, 30 * 60 * 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.setupDone]);

  return <Ctx.Provider value={{ state, dispatch, sync, syncing }}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx);

/* ---------- Dữ liệu mẫu ---------- */
export function demoState() {
  const t = todayKey();
  const r = (n) => addDays(t, n);
  const locA = { id: 'locA', name: 'Mây Homestay – Đà Lạt', address: '12 Hoa Hồng, Phường 4, Đà Lạt', emoji: '🌿', rooms: [
    { id: 'rA1', name: 'Phòng Đồi Thông' }, { id: 'rA2', name: 'Phòng Sương Mai' }, { id: 'rA3', name: 'Phòng Hoa Dã Quỳ' } ] };
  const locB = { id: 'locB', name: 'Mây House – Hội An', address: '45 Nguyễn Phúc Chu, Minh An, Hội An', emoji: '🏝️', rooms: [
    { id: 'rB1', name: 'Phòng 101' }, { id: 'rB2', name: 'Phòng 102' } ] };
  const cal = (id, roomId, platform) => ({ id, roomId, platform, url: '', checkIn: '14:00', checkOut: '12:00', demo: true });
  const calendars = [
    cal('c1', 'rA1', 'Airbnb'), cal('c2', 'rA1', 'Booking.com'), cal('c3', 'rA2', 'Airbnb'),
    cal('c4', 'rA3', 'Agoda'), cal('c5', 'rB1', 'Booking.com'), cal('c6', 'rB2', 'Airbnb'),
  ];
  const ev = (s, e, summary, description = '') => ({ uid: uid(), start: r(s), end: r(e), summary, description });
  const events = {
    c1: [ev(-6, -3, 'Reserved', 'Phone Number (Last 4 Digits): 2481'), ev(0, 3, 'Reserved', 'Phone Number (Last 4 Digits): 9034'), ev(9, 12, 'Reserved')],
    c2: [ev(-3, 0, 'CLOSED - Not available'), ev(5, 8, 'CLOSED - Not available'), ev(14, 16, 'CLOSED - Not available')],
    c3: [ev(-2, 2, 'Reserved'), ev(2, 4, 'Reserved'), ev(6, 7, 'Airbnb (Not available)'), ev(10, 15, 'Reserved')],
    c4: [ev(-1, 1, 'Agoda Booking'), ev(3, 6, 'Agoda Booking'), ev(11, 13, 'Agoda Booking')],
    c5: [ev(-4, 1, 'CLOSED - Not available'), ev(1, 5, 'CLOSED - Not available'), ev(8, 10, 'CLOSED - Not available'), ev(18, 21, 'CLOSED - Not available')],
    c6: [ev(0, 2, 'Reserved'), ev(4, 9, 'Reserved'), ev(13, 17, 'Reserved')],
  };
  const syncInfo = Object.fromEntries(calendars.map((c) => [c.id, { at: Date.now(), ok: true, count: events[c.id].length }]));
  return {
    ...emptyState(),
    setupDone: true,
    property: { name: 'Mây Homestay' },
    locations: [locA, locB],
    calendars,
    events,
    syncInfo,
    lastSync: Date.now(),
    manual: [{ id: 'm1', roomId: 'rB2', platform: 'Trực tiếp', guest: 'Chị Lan (0903 xxx 218)', start: r(-3), end: r(0), checkIn: '14:00', checkOut: '11:00', note: 'Khách quen, cần thêm 1 nệm phụ' }],
    notes: { [t]: 'Giặt toàn bộ ga gối phòng Đồi Thông. Nhắc khách phòng 102 trả chìa khoá trước 11h.' },
    tasks: [
      { id: uid(), title: 'Thay bóng đèn phòng tắm', desc: 'Phòng Sương Mai – bóng đèn gương bị chập chờn', date: t, roomId: 'rA2', priority: 'urgent', done: false },
      { id: uid(), title: 'Mua thêm đồ amenities', desc: 'Dầu gội, bàn chải, trà gừng – đủ cho 2 tuần', date: r(1), roomId: '', priority: 'important', done: false },
      { id: uid(), title: 'Kiểm tra máy lạnh', desc: 'Phòng 101 – vệ sinh lưới lọc', date: r(2), roomId: 'rB1', priority: 'normal', done: false },
      { id: uid(), title: 'Gửi hướng dẫn nhận phòng', desc: 'Gửi mật mã cửa + định vị cho khách Airbnb', date: t, roomId: 'rA1', priority: 'important', done: true },
    ],
  };
}
