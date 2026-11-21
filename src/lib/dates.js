export const pad = (n) => String(n).padStart(2, '0');
export const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const todayKey = () => toKey(new Date());
export const addDays = (k, n) => { const d = fromKey(k); d.setDate(d.getDate() + n); return toKey(d); };
export const diffDays = (a, b) => Math.round((fromKey(b) - fromKey(a)) / 86400000);
export const startOfWeek = (k) => { const d = fromKey(k); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return toKey(d); };
export const startOfMonth = (k) => k.slice(0, 8) + '01';
export const endOfMonth = (k) => { const d = fromKey(startOfMonth(k)); d.setMonth(d.getMonth() + 1); d.setDate(0); return toKey(d); };
export const addMonths = (k, n) => { const d = fromKey(startOfMonth(k)); d.setMonth(d.getMonth() + n); return toKey(d); };
export const rangeKeys = (a, b) => { const out = []; for (let k = a; k <= b; k = addDays(k, 1)) out.push(k); return out; };

export const WD_SHORT = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const WD_LONG = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
export const wdShort = (k) => WD_SHORT[(fromKey(k).getDay() + 6) % 7];
export const wdLong = (k) => WD_LONG[fromKey(k).getDay()];
export const dm = (k) => `${k.slice(8)}/${k.slice(5, 7)}`;
export const dmy = (k) => `${k.slice(8)}/${k.slice(5, 7)}/${k.slice(0, 4)}`;
export const longDate = (k) => `${wdLong(k)}, ${dmy(k)}`;
export const monthTitle = (k) => `Tháng ${Number(k.slice(5, 7))}, ${k.slice(0, 4)}`;

export function timeAgo(ts) {
  if (!ts) return 'chưa đồng bộ';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'vừa xong';
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
  return `${Math.floor(s / 86400)} ngày trước`;
}
