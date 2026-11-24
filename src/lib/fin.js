// Tính toán tài chính (hàm thuần): giá đặt phòng, tổng hợp theo tháng
import { addDays, diffDays, todayKey } from './dates.js';
import { PLATFORMS } from './platforms.js';
import { coveredByDirect } from './derive.js';

export const FIN_KEYS = ['settings', 'rateTable', 'dayDiscount', 'stayDiscount', 'otaListings', 'otaRates', 'otaRun', 'prices', 'expenses', 'history', 'roomMap', 'directRates', 'platformRates'];
export const DEFAULT_FEES = { Airbnb: 15, 'Booking.com': 15, Agoda: 18, Traveloka: 15, Expedia: 18, 'Trực tiếp': 0 };
export const EXPENSE_GROUPS = ['Điện nước', 'Internet', 'Vật tư', 'Sửa chữa', 'Thuê nhà', 'Khác'];
export const WEEK_NIGHTS = 7;
export const MONTH_NIGHTS = 28;

export const emptyFin = () => ({
  settings: { taxOn: true, taxRate: 7, fees: { ...DEFAULT_FEES } },
  rateTable: {}, dayDiscount: {}, stayDiscount: {}, otaListings: {}, otaRates: {}, otaRun: null, prices: {}, expenses: [], history: {}, roomMap: {}, directRates: {}, platformRates: {},
});
export const pickFin = (f) => {
  const e = emptyFin();
  return Object.fromEntries(FIN_KEYS.map((k) => [k, f?.[k] ?? e[k]]));
};

export const SOURCE_LABEL = { ota: 'Theo giá Airbnb (Apify)', rate: 'Theo bảng giá', report: 'Theo file báo cáo của sàn', manual: 'Nhập tay' };
export const SOURCE_SHORT = { ota: 'giá Airbnb', rate: 'bảng giá', report: 'file sàn', manual: 'nhập tay' };
export const monthOf = (k) => k.slice(0, 7);
export const feePct = (fin, platform) => Number(fin.settings?.fees?.[platform] ?? DEFAULT_FEES[platform] ?? 0);
const feeOf = (fin, platform, amount, fee) => (fee != null && fee !== '' ? Number(fee) : Math.round((amount * feePct(fin, platform)) / 100));
const clampPct = (v) => Math.min(100, Math.max(0, Number(v) || 0));

/** Đặt / xoá giá trị theo ngày cho nhiều phòng: { [roomId]: { ngày: v } } (v rỗng -> xoá) */
/** Bảng giá theo từng sàn (fin.platformRates = { [roomId]: { [sàn]: { ngày: giá } } }): đặt / xoá giá các ngày cho 1 sàn */
export function setPlatformDays(pr, roomIds, platform, days, v) {
  const out = { ...(pr || {}) };
  for (const r of roomIds) {
    const t = setDays({ x: out[r]?.[platform] }, ['x'], days, v).x;
    const room = { ...(out[r] || {}) };
    if (t) room[platform] = t; else delete room[platform];
    if (Object.keys(room).length) out[r] = room; else delete out[r];
  }
  return out;
}
/** Gộp bảng {roomId: {ngày: giá | null(xoá)}} vào bảng giá theo phòng */
export function mergeDays(table, patch) {
  const out = { ...(table || {}) };
  for (const [r, days] of Object.entries(patch || {})) {
    const t = { ...(out[r] || {}) };
    for (const [d, v] of Object.entries(days)) { if (v) t[d] = v; else delete t[d]; }
    if (Object.keys(t).length) out[r] = t; else delete out[r];
  }
  return out;
}
/** Gộp {roomId: {sàn: {ngày: giá | null}}} vào platformRates */
export function mergePlatformDays(pr, patch) {
  const out = { ...(pr || {}) };
  for (const [r, plats] of Object.entries(patch || {})) {
    const room = mergeDays(out[r], plats);
    if (Object.keys(room).length) out[r] = room; else delete out[r];
  }
  return out;
}

export function setDays(table, roomIds, days, v) {
  const out = { ...(table || {}) };
  for (const r of roomIds) {
    const t = { ...(out[r] || {}) };
    for (const d of days) { if (v) t[d] = v; else delete t[d]; }
    if (Object.keys(t).length) out[r] = t; else delete out[r];
  }
  return out;
}

/**
 * Bảng giá RIÊNG kênh Trực tiếp (fin.directRates = { [roomId]: { 'YYYY-MM-DD': giá 1 đêm } }).
 * Không dùng để tính giá các sàn; chỉ để điền sẵn giá khi tạo đặt phòng trực tiếp.
 * -> tổng giá các đêm [start, end) hoặc null nếu thiếu đêm nào
 */
export function directEstimate(fin, roomId, start, end) {
  const t = fin?.directRates?.[roomId];
  if (!t || !start || !end || end <= start) return null;
  let sum = 0;
  for (let d = start; d < end; d = addDays(d, 1)) { const p = Number(t[d]); if (!p) return null; sum += p; }
  return sum;
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
// gợi ý tên dịch vụ (không điền sẵn giá: chỉ ghi nhận khi người dùng tự nhập đơn giá)
export const EXTRA_SUGGEST = [
  { name: 'Ăn sáng' }, { name: 'Đưa đón sân bay' }, { name: 'Thuê xe máy' },
  { name: 'Giặt ủi' }, { name: 'Nệm phụ' }, { name: 'Nhận sớm / trả muộn' },
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

/** Giá sàn (Apify) của một đêm cho đúng sàn của đặt phòng */
export const otaNight = (fin, roomId, platform, day) => Number(fin.otaRates?.[roomId]?.[platform]?.[day]) || 0;

/**
 * Giá các đêm [nhận, trả) của đặt phòng: mỗi đêm ưu tiên giá sàn lấy qua Apify (đúng sàn của đặt phòng,
 * đã gồm giảm giá của sàn), không có thì dùng Bảng giá tự đặt (trừ giảm theo ngày); sau đó trừ giảm theo số đêm.
 * -> { base, amount, dayOff, stayPct, stayOff, otaNights, nights } ; thiếu giá một đêm thì null
 */
export function rateEstimate(b, fin) {
  if (!b.start || !b.end) return null;
  const t = fin.rateTable?.[b.roomId] || {};
  const pt = fin.platformRates?.[b.roomId]?.[b.platform] || {};
  const dd = fin.dayDiscount?.[b.roomId] || {};
  let base = 0; let dayOff = 0; let nights = 0; let otaNights = 0;
  for (let d = b.start; d < b.end; d = addDays(d, 1)) {
    nights += 1;
    // ưu tiên: giá tự đặt riêng cho sàn này > giá sàn lấy qua Apify > bảng giá chung
    const own = b.platform ? Number(pt[d]) || 0 : 0;
    const o = own ? 0 : (b.platform ? otaNight(fin, b.roomId, b.platform, d) : 0);
    if (o) { base += o; otaNights += 1; continue; }
    const p = own || Number(t[d]);
    if (!p) return null;
    base += p;
    if (dd[d]) dayOff += Math.round((p * clampPct(dd[d])) / 100);
  }
  if (!base) return null;
  const stayPct = stayPctFor(fin, b.roomId, nights);
  const stayOff = Math.round(((base - dayOff) * stayPct) / 100);
  return { base, amount: base - dayOff - stayOff, dayOff, stayPct, stayOff, otaNights, nights };
}
const estSource = (est) => (est.otaNights === est.nights ? 'ota' : 'rate');

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
      return { amount: est.amount, base: est.base, discountTotal: est.base - est.amount, rate: est, fee, net: est.amount - fee, source: estSource(est), estimated: true, missing: false };
    }
  }
  return { amount: null, fee: null, net: null, source: null, missing: !b.blocked };
}

const freezeEntry = (b, est) => ({
  roomId: b.roomId, platform: b.platform, guest: '', start: b.start, end: b.end, amount: est.amount,
  ...(est.base !== est.amount ? { base: est.base } : {}), source: estSource(est), at: Date.now(),
});

/** Đặt phòng từ sàn đủ giá theo bảng giá mà chưa có trong sổ -> các mục cần chốt */
/**
 * Ghép khoảng ngày của một dòng báo cáo / mục sổ với booking trong `list` (đã lọc đúng sàn) cùng phòng:
 * đúng ngày nhận + trả > cùng ngày nhận > chồng nhiều đêm nhất (≥ 1 đêm). Trả booking hoặc null.
 */
export function matchStay(list, { roomId, start, end }, taken = new Set()) {
  let best = null; let score = 0;
  for (const b of list) {
    if (b.roomId !== roomId || taken.has(b.id)) continue;
    let sc = 0;
    if (b.start === start && b.end === end) sc = 1e6;
    else if (b.start === start) sc = 1e5;
    else {
      const a = b.start > start ? b.start : start; const z = b.end < end ? b.end : end;
      const ov = a < z ? diffDays(a, z) : 0;
      if (ov >= 1) sc = ov;
    }
    if (sc > score) { score = sc; best = b; }
  }
  return best;
}
const sameSourceList = (bookings, platform) => bookings.filter((b) => b.source === 'ical' && !b.blocked && b.platform === platform);

/**
 * Chốt giá cho đặt phòng từ sàn:
 * 1. booking iCal mới xuất hiện mà đã có dòng file báo cáo cùng sàn (mục rep:… nhập trước) -> chuyển giá file sang booking;
 * 2. còn lại: đủ giá theo bảng giá / giá Airbnb mà chưa có trong sổ -> chốt.
 */
export function toFreeze(bookings, fin) {
  const out = {};
  const prices = fin.prices || {};
  const taken = new Set();
  for (const [key, e] of Object.entries(prices)) {
    if (!key.startsWith('rep:') || e?.amount == null || !e.roomId || !e.start || !e.end) continue;
    const cands = sameSourceList(bookings, e.platform).filter((b) => !prices[b.id] || prices[b.id].source === 'rate' || prices[b.id].source === 'ota');
    const hit = matchStay(cands, e, taken);
    if (!hit) continue;
    taken.add(hit.id);
    out[hit.id] = { ...e, roomId: hit.roomId, start: hit.start, end: hit.end, at: Date.now() };
    out[key] = null;
  }
  for (const b of bookings) {
    if (b.source !== 'ical' || b.blocked || prices[b.id] || taken.has(b.id)) continue;
    const est = rateEstimate(b, fin);
    if (est) out[b.id] = freezeEntry(b, est);
  }
  return out;
}

/**
 * Nhập file báo cáo của một sàn -> { entries (cho PRICES), summary }.
 * Chỉ ghép / ghi / xoá mục của ĐÚNG sàn đó; không bao giờ đụng đặt phòng trực tiếp hay sàn khác.
 * rows: [{ code, listing, guest, start, end, amount, fee }] ; roomOf: listing -> roomId ; mul: tỉ giá (1 nếu VND)
 */
export function planReportImport(rows, { platform, roomOf = {}, bookings, prices = {}, mul = 1, by = '' }) {
  const list = sameSourceList(bookings, platform);
  const taken = new Set();
  const entries = {}; const items = [];
  const sum = { updated: 0, added: 0, replacedManual: 0, noRoom: 0 };
  for (const r of rows) {
    const roomId = roomOf[r.listing] || '';
    const hit = roomId ? matchStay(list, { roomId, start: r.start, end: r.end }, taken) : null;
    if (hit) taken.add(hit.id);
    const key = hit ? hit.id : `rep:${platform}:${r.code || `${r.start}:${r.end}:${roomId}:${r.amount}`}`;
    const old = prices[key];
    // cùng mã đặt phòng đã nhập trước đây dưới khoá khác (cùng sàn) -> bỏ bản cũ để không trùng
    if (r.code) for (const [id, e] of Object.entries(prices)) if (id !== key && e?.source === 'report' && e.platform === platform && e.ref === r.code) entries[id] = null;
    const amount = Math.round(r.amount * mul);
    entries[key] = {
      roomId, platform, guest: r.guest || old?.guest || '', start: hit ? hit.start : r.start, end: hit ? hit.end : r.end, amount,
      ...(r.fee != null ? { fee: Math.round(r.fee * mul) } : {}), source: 'report', ref: r.code || '', at: Date.now(), by,
    };
    if (hit) { sum.updated += 1; if (old?.source === 'manual') sum.replacedManual += 1; } else sum.added += 1;
    if (!roomId) sum.noRoom += 1;
    items.push({ ...r, raw: r.amount, roomId, key, kind: hit ? 'update' : 'add', oldAmount: old?.amount ?? null, amount });
  }
  // bảo vệ: chỉ giữ thao tác trên mục của đúng sàn (rep:<sàn>:… hoặc booking iCal của sàn đó)
  const allowed = new Set(list.map((b) => b.id));
  for (const id of Object.keys(entries)) {
    const okKey = allowed.has(id) || id.startsWith(`rep:${platform}:`) || (prices[id]?.source === 'report' && prices[id]?.platform === platform);
    if (!okKey) delete entries[id];
  }
  return { entries, items, summary: sum };
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
    if (e && e.source !== 'rate' && e.source !== 'ota') continue;
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
    if (calId && (e.source === 'rate' || e.source === 'ota') && coveredByDirect(e.start, e.end, (state.manual || []).filter((m) => m.roomId === e.roomId))) continue;
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
