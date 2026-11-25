// Task lặp lại & lời nhắc (hàm thuần)
// task: { date, time?, repeat?: 'none'|'daily'|'weekdays'|'weekly'|'monthly'|'custom', every?, unit?, until?, remind?: phút, done, doneDates? }
// repeat 'custom': mỗi `every` (1–99) `unit` ('day' | 'week' | 'month') tính từ ngày bắt đầu
import { addDays, fromKey, toKey, endOfMonth, diffDays, WD_SHORT } from './dates.js';

export const REPEATS = [
  { id: 'none', label: 'Không' },
  { id: 'daily', label: 'Hằng ngày' },
  { id: 'weekdays', label: 'Thứ 2–6' },
  { id: 'weekly', label: 'Hằng tuần' },
  { id: 'monthly', label: 'Hằng tháng' },
];
export const REMINDS = [
  { v: null, label: 'Không nhắc' }, { v: 0, label: 'Đúng giờ' }, { v: 5, label: '5 phút' }, { v: 15, label: '15 phút' },
  { v: 30, label: '30 phút' }, { v: 60, label: '1 giờ' }, { v: 120, label: '2 giờ' }, { v: 1440, label: '1 ngày' },
];

export const UNITS = { day: 'ngày', week: 'tuần', month: 'tháng' };
export const everyOf = (t) => Math.max(1, Math.min(99, Math.floor(Number(t.every) || 1)));
export const unitOf = (t) => (UNITS[t.unit] ? t.unit : 'week');
export const isRepeating = (t) => !!t.repeat && t.repeat !== 'none' && !!t.date;
const wd = (k) => fromKey(k).getDay(); // 0 = CN

/** Nhãn lặp lại: "Hằng tuần (T4)", "Hằng tháng (ngày 15)" */
export function repeatLabel(t) {
  if (!isRepeating(t)) return '';
  if (t.repeat === 'weekly') return `Hằng tuần (${WD_SHORT[(wd(t.date) + 6) % 7]})`;
  if (t.repeat === 'monthly') return `Hằng tháng (ngày ${Number(t.date.slice(8))})`;
  if (t.repeat === 'custom') {
    const n = everyOf(t); const u = unitOf(t);
    const tail = u === 'week' ? ` (${WD_SHORT[(wd(t.date) + 6) % 7]})` : u === 'month' ? ` (ngày ${Number(t.date.slice(8))})` : '';
    return `Mỗi ${n} ${UNITS[u]}${tail}`;
  }
  return REPEATS.find((r) => r.id === t.repeat)?.label || '';
}
/** Nhắc tuỳ chỉnh "… tháng, … ngày" (lưu bằng phút như các mốc khác; 1 tháng = 30 ngày) */
export const DAY_MIN = 1440;
export const MONTH_DAYS = 30;
export const remindFromMD = (months, days) => ((Number(months) || 0) * MONTH_DAYS + (Number(days) || 0)) * DAY_MIN;
export const remindToMD = (m) => { const d = Math.round((Number(m) || 0) / DAY_MIN); return { months: Math.floor(d / MONTH_DAYS), days: d % MONTH_DAYS }; };
export const isPresetRemind = (m) => REMINDS.some((r) => r.v === (m ?? null));
/** Tên mốc nhắc: "15 phút", "1 ngày", "2 tháng 5 ngày" */
export function remindName(m) {
  const p = REMINDS.find((r) => r.v === m);
  if (p) return p.label;
  if (m % DAY_MIN === 0) {
    const { months, days } = remindToMD(m);
    return [months ? `${months} tháng` : '', days ? `${days} ngày` : ''].filter(Boolean).join(' ') || '0 ngày';
  }
  return m >= 60 && m % 60 === 0 ? `${m / 60} giờ` : `${m} phút`;
}
export const remindLabel = (m) => (m == null ? '' : m === 0 ? 'đúng giờ' : `trước ${remindName(m)}`);

/** Cùng "ngày trong tháng" với ngày bắt đầu; tháng không có ngày đó (VD 31) -> ngày cuối tháng */
function sameMonthDay(start, day) {
  const want = Number(start.slice(8));
  const last = Number(endOfMonth(day).slice(8));
  return Number(day.slice(8)) === Math.min(want, last);
}

/** Task có lịch vào ngày `day` không */
export function occursOn(t, day) {
  if (!t.date) return false;
  if (!isRepeating(t)) return t.date === day;
  if (day < t.date || (t.until && day > t.until)) return false;
  switch (t.repeat) {
    case 'daily': return true;
    case 'weekdays': { const w = wd(day); return w >= 1 && w <= 5; }
    case 'weekly': return wd(day) === wd(t.date);
    case 'monthly': return sameMonthDay(t.date, day);
    case 'custom': {
      const n = everyOf(t);
      const u = unitOf(t);
      if (u === 'day') return diffDays(t.date, day) % n === 0;
      if (u === 'week') { const d = diffDays(t.date, day); return d % 7 === 0 && (d / 7) % n === 0; }
      const months = (Number(day.slice(0, 4)) - Number(t.date.slice(0, 4))) * 12 + Number(day.slice(5, 7)) - Number(t.date.slice(5, 7));
      return months % n === 0 && sameMonthDay(t.date, day);
    }
    default: return false;
  }
}

/** Trạng thái xong của task tại lần `occ` */
export function doneAt(t, occ) {
  if (!isRepeating(t)) return { done: !!t.done, doneInfo: t.done ? { at: t.doneAt, by: t.doneBy, byName: t.doneByName } : null };
  const d = t.doneDates?.[occ];
  return { done: !!d, doneInfo: d || null };
}

/** Các lần xuất hiện của task trong [from, to] (task không ngày thì bỏ qua) */
export function taskInstances(tasks, from, to) {
  const out = [];
  for (const t of tasks) {
    if (!t.date) continue;
    if (!isRepeating(t)) { if (t.date >= from && t.date <= to) out.push({ ...t, occ: t.date, iid: t.id }); continue; }
    for (let d = from < t.date ? t.date : from; d <= to; d = addDays(d, 1)) {
      if (t.until && d > t.until) break;
      if (occursOn(t, d)) out.push({ ...t, occ: d, iid: `${t.id}@${d}`, ...doneAt(t, d) });
    }
  }
  return out;
}

/** Lần nên hiện trong danh sách: task thường = chính nó; task lặp = lần hôm nay hoặc lần kế tiếp (null nếu đã hết lịch) */
export function currentInstance(t, today) {
  if (!isRepeating(t)) return { ...t, occ: t.date || '', iid: t.id };
  const start = today < t.date ? t.date : today;
  for (let i = 0, d = start; i < 400; i++, d = addDays(d, 1)) {
    if (t.until && d > t.until) break;
    if (occursOn(t, d)) return { ...t, occ: d, iid: `${t.id}@${d}`, ...doneAt(t, d) };
  }
  return null;
}

/* ---------- Lời nhắc trên lịch điện thoại ---------- */
const pad = (n) => String(n).padStart(2, '0');
const ymd = (k) => k.replace(/-/g, '');
const RRULE_DAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/** Quy tắc lặp RFC 5545 (không có tiền tố "RRULE:") */
export function rrule(t) {
  if (!isRepeating(t)) return '';
  const until = t.until ? `;UNTIL=${ymd(t.until)}T235959Z` : '';
  switch (t.repeat) {
    case 'daily': return `FREQ=DAILY${until}`;
    case 'weekdays': return `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR${until}`;
    case 'weekly': return `FREQ=WEEKLY;BYDAY=${RRULE_DAY[wd(t.date)]}${until}`;
    case 'monthly': {
      const d = Number(t.date.slice(8));
      return d > 28 ? `FREQ=MONTHLY;BYMONTHDAY=${d},-1;BYSETPOS=1${until}` : `FREQ=MONTHLY;BYMONTHDAY=${d}${until}`;
    }
    case 'custom': return customRrule(t.date, everyOf(t), unitOf(t), until);
    default: return '';
  }
}

/** RRULE cho lặp tuỳ chỉnh (dùng chung với api/ical-out.js) */
export function customRrule(start, n, unit, until = '') {
  const iv = n > 1 ? `;INTERVAL=${n}` : '';
  if (unit === 'day') return `FREQ=DAILY${iv}${until}`;
  if (unit === 'week') return `FREQ=WEEKLY${iv};BYDAY=${RRULE_DAY[new Date(`${start}T00:00:00Z`).getUTCDay()]}${until}`;
  const d = Number(start.slice(8));
  return d > 28 ? `FREQ=MONTHLY${iv};BYMONTHDAY=${d},-1;BYSETPOS=1${until}` : `FREQ=MONTHLY${iv};BYMONTHDAY=${d}${until}`;
}

/** Dữ liệu gọn gửi lên /cal/task.ics (chỉ phần cần cho sự kiện) */
export function reminderPayload(t, roomName = '') {
  const cut = (s, n) => String(s || '').slice(0, n);
  return {
    t: cut(t.title, 120), d: cut(t.desc, 400), r: cut(roomName, 60), s: t.date, h: t.time || '',
    p: t.repeat && t.repeat !== 'none' ? t.repeat : '', u: t.until || '', m: t.remind ?? null,
    ...(t.repeat === 'custom' ? { i: everyOf(t), n: unitOf(t) } : {}),
  };
}
const b64url = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const icsUrl = (t, roomName) => `/cal/task.ics?d=${b64url(JSON.stringify(reminderPayload(t, roomName)))}`;

/** Link "Thêm vào Google Calendar" (Google dùng thông báo mặc định của lịch) */
export function googleUrl(t, roomName = '', site = 'https://hostexa.vercel.app') {
  let dates;
  if (t.time) {
    const [h, m] = t.time.split(':').map(Number);
    const start = `${ymd(t.date)}T${pad(h)}${pad(m)}00`;
    const endD = new Date(fromKey(t.date)); endD.setHours(h, m + 30);
    dates = `${start}/${ymd(toKey(endD))}T${pad(endD.getHours())}${pad(endD.getMinutes())}00`;
  } else dates = `${ymd(t.date)}/${ymd(addDays(t.date, 1))}`;
  const q = new URLSearchParams({
    action: 'TEMPLATE', text: `${t.title}${roomName ? ` – ${roomName}` : ''}`, dates,
    details: `${t.desc ? `${t.desc}\n\n` : ''}Task Hostexa · ${site}`, ctz: 'Asia/Ho_Chi_Minh',
  });
  const r = rrule(t);
  if (r) q.set('recur', `RRULE:${r}`);
  return `https://calendar.google.com/calendar/render?${q}`;
}
