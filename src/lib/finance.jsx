// Dữ liệu tài chính của cơ sở (chỉ owner / admin / xem thử).
// Đồng bộ riêng qua /api/finance — member không bao giờ tải dữ liệu này về.
import { createContext, useCallback, useContext, useEffect, useReducer, useRef, useState } from 'react';
import { api } from './session.jsx';
import { useStore } from './store.jsx';
import { merge3, deepEqual } from './merge.js';
import { emptyFin, pickFin, toFreeze, setDays } from './fin.js';
import { getBookings } from './derive.js';
import { addDays, todayKey, addMonths } from './dates.js';

const EVERY = 15 * 60 * 1000;
const DEBOUNCE = 3000;

const withPrices = (prices, entries) => {
  const out = { ...prices };
  for (const [id, e] of Object.entries(entries || {})) { if (e) out[id] = e; else delete out[id]; }
  return out;
};

function reducer(s, a) {
  switch (a.type) {
    case 'REPLACE': return pickFin(a.data);
    case 'MERGE_APPLY': return pickFin(merge3(a.snapshot, s, a.merged));
    case 'SETTINGS': return { ...s, settings: { ...s.settings, ...a.patch, fees: { ...s.settings.fees, ...(a.patch.fees || {}) } } };
    case 'SET_RATES': return { ...s, rateTable: setDays(s.rateTable, a.roomIds, a.days, a.price), prices: withPrices(s.prices, a.reprice) };
    case 'SET_DAY_DISCOUNT': return { ...s, dayDiscount: setDays(s.dayDiscount, a.roomIds, a.days, a.pct), prices: withPrices(s.prices, a.reprice) };
    case 'SET_STAY_DISCOUNT': {
      const stayDiscount = { ...(s.stayDiscount || {}) };
      if (a.rule && (a.rule.week || a.rule.month)) stayDiscount[a.key] = a.rule; else delete stayDiscount[a.key];
      return { ...s, stayDiscount, prices: withPrices(s.prices, a.reprice) };
    }
    case 'PRICE': {
      const prices = { ...s.prices };
      if (a.entry) prices[a.id] = a.entry; else delete prices[a.id];
      return { ...s, prices };
    }
    case 'PRICES': {
      const prices = { ...s.prices };
      for (const [id, e] of Object.entries(a.entries)) { if (e) prices[id] = e; else delete prices[id]; }
      return { ...s, prices };
    }
    case 'SAVE_EXPENSE': {
      const exists = s.expenses.some((x) => x.id === a.expense.id);
      return { ...s, expenses: exists ? s.expenses.map((x) => (x.id === a.expense.id ? a.expense : x)) : [a.expense, ...s.expenses] };
    }
    case 'DELETE_EXPENSE': return { ...s, expenses: s.expenses.filter((x) => x.id !== a.id) };
    case 'HISTORY': {
      const history = { ...s.history };
      if (a.entry) history[a.month] = a.entry; else delete history[a.month];
      return { ...s, history };
    }
    case 'ROOMMAP': return { ...s, roomMap: { ...s.roomMap, [a.platform]: { ...(s.roomMap[a.platform] || {}), ...a.map } } };
    default: return s;
  }
}

const read = (k) => { try { return JSON.parse(localStorage.getItem(k)) || null; } catch { return null; } };
const Ctx = createContext(null);

/** cloud = { token, ws } | null (xem thử) */
export function FinanceProvider({ enabled, cloud, children }) {
  if (!enabled) return <ForgetFinance ws={cloud?.ws}>{children}</ForgetFinance>;
  return <FinanceInner cloud={cloud}>{children}</FinanceInner>;
}

// Tài khoản không còn quyền tài chính: xoá bản lưu tạm trên máy
function ForgetFinance({ ws, children }) {
  useEffect(() => { try { if (ws) localStorage.removeItem(`hosty:fin:${ws}`); } catch { /* noop */ } }, [ws]);
  return <Ctx.Provider value={null}>{children}</Ctx.Provider>;
}

function FinanceInner({ cloud, children }) {
  const { state } = useStore();
  const key = `hosty:fin:${cloud ? cloud.ws : 'demo'}`;
  const cache = useRef(read(key));
  const [fin, dispatch] = useReducer(reducer, undefined, () => pickFin(cache.current?.fin || (cloud ? emptyFin() : demoFinance(state))));
  const [status, setStatus] = useState({ loaded: !cloud || !!cache.current, syncing: false, error: '', at: cache.current?.at || 0 });
  const finRef = useRef(fin); finRef.current = fin;
  const baseRef = useRef(cache.current?.base ?? null);
  const verRef = useRef(cache.current?.version ?? 0);
  const busy = useRef(false); const again = useRef(false);

  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify({ fin, base: baseRef.current, version: verRef.current, at: status.at })); } catch { /* noop */ }
  }, [fin, status.at, key]);

  const sync = useCallback(async () => {
    if (!cloud) return true;
    if (busy.current) { again.current = true; return false; }
    busy.current = true;
    setStatus((s) => ({ ...s, syncing: true, error: '' }));
    try {
      let remote = await api(`/api/finance?ws=${cloud.ws}`, { token: cloud.token });
      for (let i = 0; i < 4; i++) {
        const snap = pickFin(finRef.current);
        const rdata = remote.data ? pickFin(remote.data) : null;
        let merged;
        if (!rdata) merged = snap;
        else if (baseRef.current == null) merged = merge3(emptyFin(), snap, rdata);
        else merged = merge3(baseRef.current, snap, rdata);
        const needPut = rdata ? !deepEqual(merged, rdata) : !deepEqual(merged, emptyFin());
        if (needPut) {
          try {
            const r = await api('/api/finance', { token: cloud.token, method: 'PUT', body: { ws: cloud.ws, baseVersion: remote.version, data: merged } });
            remote = { ...remote, version: r.version, data: merged };
          } catch (e) {
            if (e.status === 409) { remote = { ...remote, ...e.info }; continue; }
            throw e;
          }
        }
        dispatch({ type: 'MERGE_APPLY', snapshot: snap, merged });
        baseRef.current = merged;
        verRef.current = remote.version;
        setStatus({ loaded: true, syncing: false, error: '', at: Date.now() });
        return true;
      }
      throw new Error('Máy chủ đang bận, chưa lưu được tài chính');
    } catch (e) {
      setStatus((s) => ({ ...s, syncing: false, error: e.message, loaded: s.loaded || e.status === 403 }));
      return false;
    } finally {
      busy.current = false;
      if (again.current) { again.current = false; setTimeout(sync, 0); }
    }
  }, [cloud?.ws, cloud?.token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!cloud) return undefined;
    sync();
    const t = setInterval(sync, EVERY);
    return () => clearInterval(t);
  }, [sync]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = !!cloud && status.loaded && baseRef.current != null && !deepEqual(pickFin(fin), baseRef.current);
  useEffect(() => {
    if (!dirty) return undefined;
    const t = setTimeout(sync, DEBOUNCE);
    return () => clearTimeout(t);
  }, [fin, dirty, sync]);

  // Chốt giá: đặt phòng từ sàn đủ giá theo bảng giá mà chưa có trong sổ
  useEffect(() => {
    if (!status.loaded) return;
    const entries = toFreeze(getBookings(state), finRef.current);
    if (Object.keys(entries).length) dispatch({ type: 'PRICES', entries });
  }, [state.events, state.overrides, fin.rateTable, status.loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = { fin, dispatch, status: { ...status, dirty, enabled: !!cloud }, sync };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** null nếu tài khoản không có quyền tài chính */
export const useFinance = () => useContext(Ctx);

/* ---------- Dữ liệu mẫu cho chế độ xem thử ---------- */
export function demoFinance(state) {
  const t = todayKey();
  const fin = emptyFin();
  const base = { rA1: 950000, rA2: 780000, rA3: 820000, rA4: 650000, rB2: 990000, rB3: 880000 }; // Phòng 101 (rB1) chưa đặt bảng giá
  for (const [roomId, p] of Object.entries(base)) {
    const days = {};
    for (let i = -25; i <= 90; i++) {
      const d = addDays(t, i);
      const wd = new Date(`${d}T00:00:00`).getDay();
      days[d] = Math.round((p * (wd === 5 || wd === 6 ? 1.2 : 1)) / 10000) * 10000;
    }
    fin.rateTable[roomId] = days;
  }
  // Giảm giá: theo số đêm cho mọi phòng; giảm 15% các ngày thường tuần sau ở Phòng Đồi Thông
  fin.stayDiscount = { '*': { week: 10, month: 25 } };
  const promo = {};
  for (let i = 7; i <= 13; i++) { const d = addDays(t, i); const w = new Date(`${d}T00:00:00`).getDay(); if (w !== 5 && w !== 6) promo[d] = 15; }
  fin.dayDiscount = { rA1: promo };
  // Đặt phòng trực tiếp mẫu
  const manualPrice = { m1: { base: 3000000, discount: { type: 'pct', value: 5 }, amount: 2850000 }, m2: { amount: 1300000 } };
  for (const m of state.manual || []) if (manualPrice[m.id]) fin.prices[m.id] = { roomId: m.roomId, platform: m.platform, guest: m.guest, start: m.start, end: m.end, ...manualPrice[m.id], source: 'manual', at: Date.now() };
  // Đặt phòng Booking.com đã qua: nhập từ file báo cáo
  for (const id of ['c2', 'c5']) {
    for (const e of (state.events?.[id] || []).filter((x) => x.end <= t)) {
      const cal = state.calendars.find((c) => c.id === id);
      const nights = Math.round((new Date(e.end) - new Date(e.start)) / 864e5);
      const amount = nights * (base[cal.roomId] || 800000) * 1.05;
      fin.prices[`${id}:${e.uid || e.start}`] = { roomId: cal.roomId, platform: 'Booking.com', guest: '', start: e.start, end: e.end, amount: Math.round(amount / 10000) * 10000, fee: Math.round(amount * 0.15 / 1000) * 1000, source: 'report', at: Date.now() };
    }
  }
  // Số tổng các tháng trước khi dùng hệ thống
  const hist = [[-5, 38.5, 21.2, 9.8], [-4, 42.1, 24.6, 12.3], [-3, 51.4, 27.9, 15.1], [-2, 47.2, 30.4, 13.6], [-1, 55.8, 33.1, 16.9]];
  for (const [k, a, b, c] of hist) {
    const m = addMonths(t, k).slice(0, 7);
    fin.history[m] = { revenue: { Airbnb: a * 1e6, 'Booking.com': b * 1e6, Agoda: c * 1e6, 'Trực tiếp': 6.5e6 }, fees: {}, note: '', at: Date.now() };
  }
  const mm = (k) => addMonths(t, k).slice(0, 7);
  const id = (n) => `demo-x${n}`;
  fin.expenses = [
    { id: id(1), kind: 'salary', group: 'Lương', title: 'Lương tháng', staffName: 'Chị Hoa (dọn phòng)', amount: 6500000, date: `${mm(0)}-05`, note: '' },
    { id: id(2), kind: 'salary', group: 'Lương', title: 'Lương tháng', staffName: 'Anh Tú (lễ tân)', amount: 7000000, date: `${mm(0)}-05`, note: '' },
    { id: id(3), kind: 'other', group: 'Thuê nhà', title: 'Tiền thuê nhà Hội An', amount: 5000000, date: `${mm(-5)}-01`, monthly: true, note: '' },
    { id: id(4), kind: 'other', group: 'Internet', title: 'Wifi FPT 2 cơ sở', amount: 520000, date: `${mm(-5)}-03`, monthly: true, note: '' },
    { id: id(5), kind: 'other', group: 'Điện nước', title: 'Điện nước tháng', amount: 3850000, date: `${mm(0)}-10`, note: '' },
    { id: id(6), kind: 'other', group: 'Vật tư', title: 'Amenities, ga gối', amount: 1450000, date: `${mm(0)}-12`, note: '' },
    { id: id(7), kind: 'salary', group: 'Lương', title: 'Lương tháng', staffName: 'Chị Hoa (dọn phòng)', amount: 6500000, date: `${mm(-1)}-05`, note: '' },
    { id: id(8), kind: 'salary', group: 'Lương', title: 'Lương tháng', staffName: 'Anh Tú (lễ tân)', amount: 7000000, date: `${mm(-1)}-05`, note: '' },
    { id: id(9), kind: 'other', group: 'Điện nước', title: 'Điện nước tháng', amount: 3420000, date: `${mm(-1)}-10`, note: '' },
  ];
  for (const k of [-5, -4, -3, -2]) {
    fin.expenses.push({ id: id(`s${k}`), kind: 'salary', group: 'Lương', title: 'Lương tháng (2 nhân viên)', staffName: 'Chị Hoa, Anh Tú', amount: 13500000, date: `${mm(k)}-05`, note: '' });
    fin.expenses.push({ id: id(`d${k}`), kind: 'other', group: 'Điện nước', title: 'Điện nước tháng', amount: 3000000 + (k + 6) * 150000, date: `${mm(k)}-10`, note: '' });
  }
  return fin;
}
