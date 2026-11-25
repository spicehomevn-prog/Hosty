import { createContext, useContext, useEffect, useReducer, useCallback, useRef, useState } from 'react';
import { fetchCalendar } from './ical.js';
import { addDays, todayKey } from './dates.js';
import { pickSync, merge3, deepEqual } from './merge.js';
import { api } from './session.jsx';

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const CLOUD_EVERY = 15 * 60 * 1000; // tự đồng bộ mỗi 15 phút
const EDIT_DEBOUNCE = 20 * 1000; // và 20 giây sau lần sửa cuối

export { PLATFORMS, platformColor } from './platforms.js';

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
  cleanAdj: {}, // { [mã thẻ]: { hide: true } | { date: 'YYYY-MM-DD' } } – admin xoá / dời ngày thẻ dọn phòng
  cleanExtra: [], // [{ id, roomId, date, time, note }] – thẻ dọn phòng admin thêm tay
  cleanNotes: {}, // { [mã thẻ]: 'ghi chú riêng của thẻ dọn phòng' }
  settings: { font: 'Be Vietnam Pro', calView: 'month' },
});

/** Điền giá trị mặc định cho các khoá đồng bộ bị thiếu */
function withDefaults(synced) {
  const e = emptyState();
  const out = {};
  for (const [k, v] of Object.entries(synced)) out[k] = v === undefined || v === null ? e[k] : v;
  return out;
}

/** Dữ liệu cũ trên máy (trước khi có tài khoản) — để đưa lên cơ sở mới */
export function loadLegacy() {
  for (const k of ['hosty:v1', 'lichphong:v1']) {
    try {
      const raw = localStorage.getItem(k);
      if (raw) { const s = JSON.parse(raw); if (s?.setupDone && Array.isArray(s.locations)) return { ...emptyState(), ...s }; }
    } catch { /* noop */ }
  }
  return null;
}

function reducer(state, a) {
  switch (a.type) {
    case 'REPLACE': return { ...emptyState(), ...a.state, settings: state.settings };
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
      if (cleanDone[a.id]) delete cleanDone[a.id];
      else cleanDone[a.id] = { at: Date.now(), by: a.by || '', byName: a.byName || '' };
      return { ...state, cleanDone };
    }
    case 'CLEAN_ADJ': {
      const cleanAdj = { ...(state.cleanAdj || {}) };
      if (a.patch) cleanAdj[a.id] = a.patch; else delete cleanAdj[a.id];
      return { ...state, cleanAdj };
    }
    case 'CLEAN_NOTE': {
      const cleanNotes = { ...(state.cleanNotes || {}) };
      if (a.text && a.text.trim()) cleanNotes[a.id] = a.text.trim(); else delete cleanNotes[a.id];
      return { ...state, cleanNotes };
    }
    case 'SAVE_CLEAN_EXTRA': {
      const list = state.cleanExtra || [];
      const exists = list.some((x) => x.id === a.card.id);
      return { ...state, cleanExtra: exists ? list.map((x) => (x.id === a.card.id ? a.card : x)) : [...list, a.card] };
    }
    case 'DELETE_CLEAN_EXTRA': {
      const cleanDone = { ...state.cleanDone }; delete cleanDone[a.id];
      return { ...state, cleanExtra: (state.cleanExtra || []).filter((x) => x.id !== a.id), cleanDone };
    }
    case 'SAVE_TASK': {
      const exists = state.tasks.some((t) => t.id === a.task.id);
      return { ...state, tasks: exists ? state.tasks.map((t) => (t.id === a.task.id ? a.task : t)) : [a.task, ...state.tasks] };
    }
    case 'TOGGLE_TASK':
      return {
        ...state,
        tasks: state.tasks.map((t) => {
          if (t.id !== a.id) return t;
          if (a.occ && t.repeat && t.repeat !== 'none') {
            // task lặp lại: chỉ đánh dấu đúng lần này
            const doneDates = { ...(t.doneDates || {}) };
            if (doneDates[a.occ]) delete doneDates[a.occ];
            else doneDates[a.occ] = { at: Date.now(), by: a.by || '', byName: a.byName || '' };
            return { ...t, doneDates };
          }
          if (t.done) { const { doneAt, doneBy, doneByName, ...rest } = t; return { ...rest, done: false }; } // eslint-disable-line no-unused-vars
          return { ...t, done: true, doneAt: Date.now(), doneBy: a.by || '', doneByName: a.byName || '' };
        }),
      };
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
    // Áp bản đã gộp từ máy chủ, giữ lại những gì máy này sửa trong lúc đang đồng bộ
    case 'CLOUD_APPLY': {
      const cur = pickSync(state);
      return { ...state, ...withDefaults(merge3(a.snapshot, cur, a.merged)) };
    }
    case 'CLOUD_REPLACE': return { ...state, ...withDefaults(pickSync(a.data || {})) };
    default: return state;
  }
}

function readCache(key) {
  try { return JSON.parse(localStorage.getItem(key)) || null; } catch { return null; }
}

const Ctx = createContext(null);

/**
 * scope = {
 *   cacheKey,                       // nơi lưu tạm trên máy
 *   cloud: { token, ws, user } | null,
 *   initial: () => state,           // khi chưa có gì trong bộ nhớ tạm
 *   onAuthError: () => void,        // phiên hết hạn
 * }
 */
export function StoreProvider({ scope, role, user, children }) {
  const { cacheKey, cloud } = scope;
  const cache = useRef(readCache(cacheKey));
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    ...emptyState(), ...(cache.current?.state || scope.initial?.() || {}),
  }));
  const [syncing, setSyncing] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  // ---- trạng thái đồng bộ lên mây ----
  const baseRef = useRef(cache.current?.base ?? null);
  const versionRef = useRef(cache.current?.version ?? 0);
  const [cloudState, setCloudState] = useState({
    status: cloud ? 'idle' : 'local',
    at: cache.current?.lastCloudSync || 0,
    error: '',
    loaded: !cloud || !!cache.current,
  });
  const lastAtRef = useRef(cache.current?.lastCloudSync || 0);
  const busyRef = useRef(false);
  const againRef = useRef(false);

  const persist = useCallback(() => {
    try {
      localStorage.setItem(cacheKey, JSON.stringify({
        state: stateRef.current, base: baseRef.current, version: versionRef.current, lastCloudSync: lastAtRef.current,
      }));
    } catch { /* noop */ }
  }, [cacheKey]);

  useEffect(() => { persist(); }, [state, persist]);

  const cloudSync = useCallback(async () => {
    if (!cloud) return false;
    if (busyRef.current) { againRef.current = true; return false; }
    busyRef.current = true;
    setCloudState((c) => ({ ...c, status: 'syncing', error: '' }));
    try {
      let remote = await api(`/api/data?ws=${cloud.ws}`, { token: cloud.token });
      let done = false;
      for (let attempt = 0; attempt < 4; attempt++) {
        const snapshot = pickSync(stateRef.current);
        let merged;
        if (!remote.data) merged = snapshot.setupDone ? snapshot : null; // máy chủ chưa có dữ liệu
        else if (baseRef.current == null) {
          // máy mới: lấy bản máy chủ; nếu máy này đã kịp thiết lập (lúc mất mạng) thì gộp cả hai
          merged = snapshot.setupDone ? merge3(pickSync(emptyState()), snapshot, pickSync(remote.data)) : pickSync(remote.data);
        } else merged = merge3(baseRef.current, snapshot, pickSync(remote.data));

        if (merged && (!remote.data || !deepEqual(merged, pickSync(remote.data)))) {
          try {
            const r = await api('/api/data', { token: cloud.token, method: 'PUT', body: { ws: cloud.ws, baseVersion: remote.version, data: merged } });
            remote = { version: r.version, data: merged };
          } catch (e) {
            if (e.status === 409) { remote = e.info; continue; }
            if (e.status === 403 && remote.data) {
              // không có quyền sửa: quay về bản trên máy chủ
              dispatch({ type: 'CLOUD_REPLACE', data: remote.data });
              baseRef.current = pickSync(remote.data);
              versionRef.current = remote.version;
              throw e;
            }
            throw e;
          }
        }
        if (merged || remote.data) {
          const final = merged || pickSync(remote.data);
          dispatch({ type: 'CLOUD_APPLY', snapshot, merged: final });
          baseRef.current = final;
        }
        versionRef.current = remote.version;
        done = true;
        break;
      }
      if (!done) throw new Error('Máy chủ đang bận, chưa lưu được thay đổi. Bấm để thử lại.');
      lastAtRef.current = Date.now();
      persist();
      setCloudState({ status: 'ok', at: lastAtRef.current, error: '', loaded: true });
      return true;
    } catch (e) {
      if (e.status === 401) { scope.onAuthError?.(); return false; }
      setCloudState((c) => ({ ...c, status: e.offline ? 'offline' : 'error', error: e.message }));
      return false;
    } finally {
      busyRef.current = false;
      if (againRef.current) { againRef.current = false; setTimeout(() => cloudSync(), 0); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloud?.ws, cloud?.token, persist]);

  // Đồng bộ khi mở, mỗi 15 phút, khi chuyển app xuống nền / mở lại, khi có mạng trở lại
  useEffect(() => {
    if (!cloud) return undefined;
    cloudSync();
    // app ở nền (màn hình tắt / chuyển app) thì không đồng bộ định kỳ – mở lại sẽ đồng bộ ngay (onVis)
    const t = setInterval(() => { if (document.visibilityState !== 'hidden') cloudSync(); }, CLOUD_EVERY);
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        if (!deepEqual(pickSync(stateRef.current), baseRef.current)) cloudSync();
      } else if (Date.now() - lastAtRef.current > 60 * 1000) cloudSync();
    };
    const onOnline = () => cloudSync();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', onOnline);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('online', onOnline);
    };
  }, [cloudSync]); // eslint-disable-line react-hooks/exhaustive-deps

  // Có thay đổi chưa đồng bộ -> đồng bộ sau 20 giây không sửa gì thêm
  const dirty = !!cloud && cloudState.loaded && !deepEqual(pickSync(state), baseRef.current);
  useEffect(() => {
    if (!dirty) return undefined;
    const t = setTimeout(cloudSync, EDIT_DEBOUNCE);
    return () => clearTimeout(t);
  }, [state, dirty, cloudSync]);

  // ---- đồng bộ iCal ----
  const sync = useCallback(async (calendars) => {
    // tài khoản Dọn phòng không có link sàn (hasUrl): máy chủ tự đọc lịch theo id
    const list = (calendars || stateRef.current.calendars).filter((c) => (c.url || (c.hasUrl && cloud?.ws)) && !c.demo);
    if (!list.length) return [];
    setSyncing(true);
    const results = await Promise.all(
      list.map(async (c) => {
        try { return { id: c.id, ok: true, events: await fetchCalendar(c.url || { ws: cloud.ws, cal: c.id }) }; }
        catch (e) { return { id: c.id, ok: false, error: e.message }; }
      }),
    );
    dispatch({ type: 'SYNC_RESULT', results });
    setSyncing(false);
    return results;
  }, []);

  // Tự tải lại iCal khi mở app nếu lần cuối > 30 phút
  useEffect(() => {
    if (state.setupDone && Date.now() - (state.lastSync || 0) > 30 * 60 * 1000) sync();
    const t = setInterval(() => { if (stateRef.current.setupDone) sync(); }, 30 * 60 * 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.setupDone]);

  const value = {
    state, dispatch, sync, syncing, role, user,
    cloud: { ...cloudState, enabled: !!cloud, dirty, syncNow: cloudSync },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx);

/* ---------- Dữ liệu mẫu ---------- */
export function demoState() {
  const t = todayKey();
  const r = (n) => addDays(t, n);
  const locA = { id: 'locA', name: 'Mây Homestay – Đà Lạt', address: '12 Hoa Hồng, Phường 4, Đà Lạt', emoji: '🌿', rooms: [
    { id: 'rA1', name: 'Phòng Đồi Thông' }, { id: 'rA2', name: 'Phòng Sương Mai' }, { id: 'rA3', name: 'Phòng Hoa Dã Quỳ' }, { id: 'rA4', name: 'Phòng Gác Mái' } ] };
  const locB = { id: 'locB', name: 'Mây House – Hội An', address: '45 Nguyễn Phúc Chu, Minh An, Hội An', emoji: '🏝️', rooms: [
    { id: 'rB1', name: 'Phòng 101' }, { id: 'rB2', name: 'Phòng 102' }, { id: 'rB3', name: 'Phòng 103' } ] };
  const cal = (id, roomId, platform) => ({ id, roomId, platform, url: '', checkIn: '14:00', checkOut: '12:00', demo: true });
  const calendars = [
    cal('c1', 'rA1', 'Airbnb'), cal('c2', 'rA1', 'Booking.com'), cal('c3', 'rA2', 'Airbnb'),
    cal('c4', 'rA3', 'Agoda'), cal('c5', 'rB1', 'Booking.com'), cal('c6', 'rB2', 'Airbnb'),
    cal('c7', 'rB3', 'Agoda'), cal('c8', 'rB2', 'Booking.com'), cal('c9', 'rA4', 'Airbnb'),
  ];
  const ev = (s, e, summary, description = '') => ({ uid: uid(), start: r(s), end: r(e), summary, description });
  const events = {
    c1: [ev(-6, -3, 'Reserved', 'Phone Number (Last 4 Digits): 2481'), ev(0, 3, 'Reserved', 'Phone Number (Last 4 Digits): 9034'), ev(9, 12, 'Reserved')],
    c2: [ev(-3, 0, 'CLOSED - Not available'), ev(5, 8, 'CLOSED - Not available'), ev(14, 16, 'CLOSED - Not available')],
    c3: [ev(-2, 2, 'Reserved'), ev(2, 4, 'Reserved'), ev(6, 7, 'Airbnb (Not available)'), ev(10, 15, 'Reserved')],
    c4: [ev(-1, 1, 'Agoda Booking'), ev(3, 6, 'Agoda Booking'), ev(11, 13, 'Agoda Booking')],
    c5: [ev(-4, 1, 'CLOSED - Not available'), ev(1, 5, 'CLOSED - Not available'), ev(8, 10, 'CLOSED - Not available'), ev(18, 21, 'CLOSED - Not available')],
    c6: [ev(0, 2, 'Reserved'), ev(4, 9, 'Reserved'), ev(13, 17, 'Reserved')],
    c7: [ev(-2, 0, 'Agoda Booking'), ev(3, 5, 'Agoda Booking'), ev(12, 14, 'Agoda Booking')],
    // lịch khoá do Hostexa xuất đặt phòng trực tiếp lên sàn, sàn trả ngược về -> app tự ẩn (trùng m1, m2)
    c8: [ev(-3, 0, 'CLOSED - Not available'), ev(9, 11, 'CLOSED - Not available')],
    c9: [ev(2, 4, 'Airbnb (Not available)'), ev(8, 10, 'Reserved')],
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
    manual: [{ id: 'm1', roomId: 'rB2', platform: 'Trực tiếp', guest: 'Chị Lan (0903 xxx 218)', start: r(-3), end: r(0), checkIn: '14:00', checkOut: '11:00', note: 'Khách quen, cần thêm 1 nệm phụ' },
      { id: 'm2', roomId: 'rA4', platform: 'Trực tiếp', guest: 'Anh Minh (0909 xxx 456)', start: r(2), end: r(4), checkIn: '14:00', checkOut: '12:00', note: '' }],
    notes: { [t]: 'Giặt toàn bộ ga gối phòng Đồi Thông. Nhắc khách phòng 102 trả chìa khoá trước 11h.' },
    tasks: [
      { id: uid(), title: 'Thay bóng đèn phòng tắm', desc: 'Phòng Sương Mai – bóng đèn gương bị chập chờn', date: t, roomId: 'rA2', priority: 'urgent', done: false },
      { id: uid(), title: 'Mua thêm đồ amenities', desc: 'Dầu gội, bàn chải, trà gừng – đủ cho 2 tuần', date: r(1), roomId: '', priority: 'important', done: false },
      { id: uid(), title: 'Kiểm tra máy lạnh', desc: 'Phòng 101 – vệ sinh lưới lọc', date: r(2), roomId: 'rB1', priority: 'normal', done: false },
      { id: uid(), title: 'Gửi hướng dẫn nhận phòng', desc: 'Gửi mật mã cửa + định vị cho khách Airbnb', date: t, roomId: 'rA1', priority: 'important', done: true },
    ],
  };
}
