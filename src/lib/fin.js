// Tính toán tài chính (hàm thuần): giá đặt phòng, tổng hợp theo tháng
import { addDays, diffDays, todayKey } from './dates.js';
import { PLATFORMS } from './store.jsx';
import { coveredByDirect } from './derive.js';

export const FIN_KEYS = ['settings', 'rateTable', 'dayDiscount', 'stayDiscount', 'prices', 'expenses', 'history', 'roomMap'];
export const DEFAULT_FEES = { Airbnb: 15, 'Booking.com': 15, Agoda: 18, Traveloka: 15, Expedia: 18, 'Trực tiếp': 0 };
export const EXPENSE_GROUPS = ['Điện nước', 'Internet', 'Vật tư', 'Sửa chữa', 'Thuê nhà', 'Khác'];
export const WEEK_NIGHTS = 7;
export const MONTH_NIGHTS = 28;

export const emptyFin = () => ({
  settings: { taxOn: true, taxRate: 7, fees: { ...DEFAULT_FEES } },
  rateTable: {}, dayDiscount: {}, stayDiscount: {}, prices: {}, expenses: [], history: {}, roomMap: {},
});
export const pickFin = (f) => {
  const e = emptyFin();
  return Object.fromEntries(FIN_KEYS.map((k) => [k, f?.[k] ?? e[k]]));
};

export const SOURCE_LABEL = { rate: 'Theo bảng giá', report: 'Theo file báo cáo của sàn', manual: 'Nhập tay' };
export const SOURCE_SHORT = { rate: 'bảng giá', report: 'file sàn', manual: 'nhập tay' };
export const monthOf = (k) => k.slice(0, 7);
export const feePct = (fin, platform) => Number(fin.settings?.fees?.[platform] ?? DEFAULT_FEES[platform] ?? 0);
const feeOf = (fin, platform, amount, fee) => (fee != null && fee !== '' ? Number(fee) : Math.round((amount * feePct(fin, platform)) / 100));
const clampPct = (v) => Math.min(100, Math.max(0, Number(v) || 0));

/** Đặt / xoá giá trị theo ngày cho nhiều phòng: { [roomId]: { ngày: v } } (v rỗng -> xoá) */
export function setDays(table, roomIds, days, v) {
  const out = { ...(table || {}) };
  for (const r of roomIds) {
    const t = { ...(out[r] || {}) };
    for (const d of days) { if (v) t[d] = v; else delete t[d]; }
    if (Object.keys(t).length) out[r] = t; else delete out[r];
  }
  return out;
}

/** Giảm giá theo số đêm của phòng (cài riêng của phòng, không có thì dùng cài chung '*') */
export function stayRule(fin, roomId) {
  const own = fin.stayDiscount?.[roomId];
  return own && (own.week || own.month) ? own : fin.stayDiscount?.['*'] || null;
}
export function stayPctFor(fin, roomId, nights) {
  const r = stayRule(fin, roomId);
  if (!r) return 0;
  if (nights >= MONTH_NIGHTS && r.month) return clampPct(r.month);
  if (nights >= WEEK_NIGHTS && r.week) return clampPct(r.week);
  return 0;
}

/* ---------- Thanh toán đặt phòng trực tiếp: dịch vụ cộng thêm, đặt cọc, còn phải thu ---------- */
export const EXTRA_SUGGEST = [
  { name: 'Ăn sáng', price: 80000 }, { name: 'Đưa đón sân bay', price: 250000 }, { name: 'Thuê xe máy', price: 150000 },
  { name: 'Giặt ủi', price: 100000 }, { name: 'Nệm phụ', price: 150000 }, { name: 'Nhận sớm / trả muộn', price: 200000 },
];
export const extrasTotal = (e) => (e?.extras || []).reduce((a, x) => a + Math.round(Number(x.price) || 0) * Math.max(0, Number(x.qty) || 0), 0);
export const bookingTotal = (e) => (Number(e?.amount) || 0) + extrasTotal(e);
export const balanceDue = (e) => (e?.paidAt ? 0 : Math.max(0, bookingTotal(e) - (Number(e?.deposit) || 0)));

/** Giảm giá cho riêng một đặt phòng: { type: 'pct'|'amount', value } -> giá sau giảm (không âm) */
export function applyDiscount(base, discount) {
  const b = Number(base) || 0;
  if (!discount || !Number(discount.value)) return b;
  const off = discount.type === 'pct' ? Math.round((b * clampPct(discount.value)) / 100) : Math.round(Number(discount.value));
  return Math.max(0, b - Math.min(b, off));
}

/**
 * Giá theo bảng giá của phòng cho các đêm [nhận, trả), đã trừ giảm theo ngày và theo số đêm.
 * -> { base, amount, dayOff, stayPct, stayOff } ; thiếu giá một đêm thì null
 */
export function rateEstimate(b, fin) {
  const t = fin.rateTable?.[b.roomId];
  if (!t || !b.start || !b.end) return null;
  const dd = fin.dayDiscount?.[b.roomId] || {};
  let base = 0; let dayOff = 0; let nights = 0;
  for (let d = b.start; d < b.end; d = addDays(d, 1)) {
    const p = Number(t[d]);
    if (!p) return null;
    base += p; nights += 1;
    if (dd[d]) dayOff += Math.round((p * clampPct(dd[d])) / 100);
  }
  if (!base) return null;
  const stayPct = stayPctFor(fin, b.roomId, nights);
  const stayOff = Math.round(((base - dayOff) * stayPct) / 100);
  return { base, amount: base - dayOff - stayOff, dayOff, stayPct, stayOff };
}

/** Giá của một đặt phòng: { amount, base, discountTotal, fee, net, source, missing, estimated } */
export function bookingPrice(b, fin) {
  const e = fin.prices?.[b.id];
  if (e && e.amount != null) {
    const fee = feeOf(fin, e.platform || b.platform, e.amount, e.fee);
    const base = e.base != null ? Number(e.base) : e.amount;
    const extras = extrasTotal(e);
    return {
      amount: e.amount, base, discountTotal: Math.max(0, base - e.amount), fee, net: e.amount - fee + extras, source: e.source || 'manual', entry: e, missing: false,
      extras, total: e.amount + extras, deposit: Number(e.deposit) || 0, due: b.source === 'manual' ? balanceDue(e) : 0, // chỉ khách trực tiếp mới thu tại chỗ
    };
  }
  if (b.source === 'ical' && !b.blocked) {
    const est = rateEstimate(b, fin);
    if (est) {
      const fee = feeOf(fin, b.platform, est.amount);
      return { amount: est.amount, base: est.base, discountTotal: est.base - est.amount, rate: est, fee, net: est.amount - fee, source: 'rate', estimated: true, missing: false };
    }
  }
  return { amount: null, fee: null, net: null, source: null, missing: !b.blocked };
}

const freezeEntry = (b, est) => ({
  roomId: b.roomId, platform: b.platform, guest: '', start: b.start, end: b.end, amount: est.amount,
  ...(est.base !== est.amount ? { base: est.base } : {}), source: 'rate', at: Date.now(),
});

/** Đặt phòng từ sàn đủ giá theo bảng giá mà chưa có trong sổ -> các mục cần chốt */
export function toFreeze(bookings, fin) {
  const out = {};
  for (const b of bookings) {
    if (b.source !== 'ical' || b.blocked || fin.prices?.[b.id]) continue;
    const est = rateEstimate(b, fin);
    if (est) out[b.id] = freezeEntry(b, est);
  }
  return out;
}

/**
 * Sau khi đổi bảng giá / giảm giá các ngày `days` của các phòng `roomIds`: tính lại giá các đặt phòng đã chốt theo
 * bảng giá (source 'rate') có đêm trùng những ngày đó ({ all: true }: mọi đặt phòng của các phòng đó).
 * Giá nhập tay / từ file báo cáo giữ nguyên.
 */
export function repriceAfter(bookings, fin, roomIds, days, { all = false } = {}) {
  const rooms = new Set(roomIds); const set = new Set(days || []);
  const out = {};
  for (const b of bookings) {
    if (b.source !== 'ical' || b.blocked || !rooms.has(b.roomId)) continue;
    const e = fin.prices?.[b.id];
    if (e && e.source !== 'rate') continue;
    let hit = all;
    for (let d = b.start; !hit && d < b.end; d = addDays(d, 1)) if (set.has(d)) hit = true;
    if (!hit) continue;
    const est = rateEstimate(b, fin);
    out[b.id] = est ? freezeEntry(b, est) : null;
  }
  return out;
}

/**
 * Sổ đặt phòng để tính tiền: đặt phòng hiện có + đặt phòng cũ chỉ còn trong sổ giá
 * (sàn đã xoá khỏi iCal sau khi khách trả phòng, hoặc nhập từ file báo cáo).
 * Đặt phòng tương lai lấy từ iCal mà đã biến khỏi lịch (lịch vẫn đồng bộ được) -> có thể đã huỷ, không tính.
 */
export function ledger(state, bookings, fin, today = todayKey()) {
  const items = [];
  const ids = new Set();
  for (const b of bookings) {
    if (b.blocked) continue;
    ids.add(b.id);
    items.push({ ...b, price: bookingPrice(b, fin) });
  }
  const cancelled = [];
  const calOk = (calId) => state.syncInfo?.[calId]?.ok;
  for (const [id, e] of Object.entries(fin.prices || {})) {
    if (ids.has(id) || e.amount == null || !e.start || !e.end) continue;
    const calId = id.includes(':') && !id.startsWith('rep:') ? id.split(':')[0] : null;
    const manualGone = !calId && !id.startsWith('rep:'); // đặt phòng trực tiếp đã xoá
    if (manualGone) continue;
    // bản sao lịch khoá của đặt phòng trực tiếp (sàn trả ngược về) đã lỡ chốt giá -> không tính
    if (calId && e.source === 'rate' && coveredByDirect(e.start, e.end, (state.manual || []).filter((m) => m.roomId === e.roomId))) continue;
    const b = {
      id, roomId: e.roomId || '', platform: e.platform || 'Khác', start: e.start, end: e.end, summary: e.guest || '',
      source: id.startsWith('rep:') ? 'report' : 'ical', calendarId: calId, ledgerOnly: true, color: null,
    };
    const fee = feeOf(fin, b.platform, e.amount, e.fee);
    const price = { amount: e.amount, fee, net: e.amount - fee, source: e.source, entry: e, missing: false };
    if (calId && e.end > today && calOk(calId) && state.lastSync) cancelled.push({ ...b, price });
    else items.push({ ...b, price });
  }
  return { items, cancelled };
}

const monthEnd = (m) => { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };

/** Số đêm của [start, end) nằm trong tháng m ("YYYY-MM") */
export function nightsIn(b, m) {
  const a = b.start > `${m}-01` ? b.start : `${m}-01`;
  const z = b.end < monthEnd(m) ? b.end : monthEnd(m);
  return Math.max(0, diffDays(a, z));
}

/** Khoản chi tính vào tháng m (khoản lặp lại hằng tháng tính mỗi tháng từ tháng bắt đầu tới tháng kết thúc) */
export function expensesIn(fin, m) {
  return (fin.expenses || []).filter((x) => {
    const start = monthOf(x.date || '');
    if (!start) return false;
    if (x.monthly) return start <= m && (!x.until || x.until >= m);
    return start === m;
  });
}

/** Tổng hợp tháng m */
export function monthSummary(items, fin, m) {
  const revenue = {}; const fees = {};
  let discountTotal = 0; let servicesTotal = 0;
  const dueList = [];
  let nights = 0; let pricedNights = 0; let missing = 0;
  const rows = [];
  for (const b of items) {
    const n = nightsIn(b, m);
    if (!n) continue;
    const total = Math.max(1, diffDays(b.start, b.end));
    const share = n / total;
    nights += n;
    const p = b.price;
    if (p.amount == null) { missing += 1; rows.push({ b, n, share, amount: null, fee: null }); continue; }
    const ext = Math.round((p.extras || 0) * share);
    const amount = Math.round(p.amount * share) + ext; const fee = Math.round(p.fee * share);
    discountTotal += Math.round((p.discountTotal || 0) * share);
    servicesTotal += ext;
    if (p.due > 0) dueList.push({ b, due: p.due, total: p.total, deposit: p.deposit });
    pricedNights += n;
    revenue[b.platform] = (revenue[b.platform] || 0) + amount;
    fees[b.platform] = (fees[b.platform] || 0) + fee;
    rows.push({ b, n, share, amount, fee });
  }
  const hist = fin.history?.[m];
  let fromHistory = false;
  let rev = revenue; let fee = fees;
  if (hist) {
    fromHistory = true;
    rev = {}; fee = {};
    for (const [p, v] of Object.entries(hist.revenue || {})) {
      if (!v) continue;
      rev[p] = Number(v);
      const f = hist.fees?.[p];
      fee[p] = f != null && f !== '' ? Number(f) : Math.round((Number(v) * feePct(fin, p)) / 100);
    }
  }
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  const revenueTotal = sum(rev);
  const feeTotal = sum(fee);
  const tax = fin.settings?.taxOn ? Math.round((revenueTotal * Number(fin.settings.taxRate || 0)) / 100) : 0;
  const exp = expensesIn(fin, m);
  const salary = exp.filter((x) => x.kind === 'salary').reduce((a, x) => a + Number(x.amount || 0), 0);
  const otherByGroup = {};
  for (const x of exp.filter((e) => e.kind !== 'salary')) otherByGroup[x.group || 'Khác'] = (otherByGroup[x.group || 'Khác'] || 0) + Number(x.amount || 0);
  const other = sum(otherByGroup);
  const cost = feeTotal + tax + salary + other;
  rows.sort((a, b) => (a.b.start < b.b.start ? -1 : a.b.start > b.b.start ? 1 : 0));
  return {
    month: m, revenue: rev, fees: fee, revenueTotal, feeTotal, tax, salary, other, otherByGroup, cost,
    profit: revenueTotal - cost, nights, adr: !fromHistory && pricedNights ? Math.round((revenueTotal - servicesTotal) / pricedNights) : null,
    missing, rows, expenses: exp, fromHistory, history: hist || null, discountTotal: fromHistory ? 0 : discountTotal, servicesTotal: fromHistory ? 0 : servicesTotal, dueList,
  };
}

/** Thứ tự sàn khi hiển thị */
export const platformOrder = (names) => {
  const order = PLATFORMS.map((p) => p.name);
  return [...names].sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
};

/**
 * Tiến độ thu tiền khách đặt trực tiếp: đặt phòng trực tiếp có ngày ở trong tháng `m`
 * + mọi đặt phòng trực tiếp tháng cũ còn nợ.
 * -> { total, collected, due, count, dueCount, pct (0..100), done }
 */
export function collectStats(items, m) {
  let total = 0; let collected = 0; let due = 0; let count = 0; let dueCount = 0;
  for (const b of items) {
    if (b.source !== 'manual' || b.price?.amount == null) continue;
    const p = b.price;
    const inMonth = b.start.slice(0, 7) <= m && b.end > `${m}-01`;
    if (!inMonth && !(p.due > 0 && b.start.slice(0, 7) < m)) continue;
    count += 1;
    total += p.total;
    collected += p.entry?.paidAt ? p.total : Math.min(p.deposit || 0, p.total);
    due += p.due;
    if (p.due > 0) dueCount += 1;
  }
  const pct = total ? Math.min(100, Math.round((collected / total) * 100)) : 100;
  return { total, collected, due, count, dueCount, pct: due > 0 ? Math.min(pct, 99) : 100, done: due === 0 };
}
