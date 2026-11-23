// Task lặp lại & lời nhắc (hàm thuần)
// task: { date, time?, repeat?: 'none'|'daily'|'weekdays'|'weekly'|'monthly', until?, remind?: phút, done, doneDates? }
import { addDays, fromKey, toKey, endOfMonth, WD_SHORT } from './dates.js';

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

export const isRepeating = (t) => !!t.repeat && t.repeat !== 'none' && !!t.date;
const wd = (k) => fromKey(k).getDay(); // 0 = CN

/** Nhãn lặp lại: "Hằng tuần (T4)", "Hằng tháng (ngày 15)" */
export function repeatLabel(t) {
  if (!isRepeating(t)) return '';
  if (t.repeat === 'weekly') return `Hằng tuần (${WD_SHORT[(wd(t.date) + 6) % 7]})`;
  if (t.repeat === 'monthly') return `Hằng tháng (ngày ${Number(t.date.slice(8))})`;
  return REPEATS.find((r) => r.id === t.repeat)?.label || '';
}
export const remindLabel = (m) => (m == null ? '' : m === 0 ? 'đúng giờ' : `trước ${REMINDS.find((r) => r.v === m)?.label || `${m} phút`}`);

/** Task có lịch vào ngày `day` không */
export function occursOn(t, day) {
  if (!t.date) return false;
  if (!isRepeating(t)) return t.date === day;
  if (day < t.date || (t.until && day > t.until)) return false;
  switch (t.repeat) {
    case 'daily': return true;
    case 'weekdays': { const w = wd(day); return w >= 1 && w <= 5; }
    case 'weekly': return wd(day) === wd(t.date);
    case 'monthly': {
      // tháng không có ngày đó (VD 31) -> ngày cuối tháng
      const want = Number(t.date.slice(8));
      const last = Number(endOfMonth(day).slice(8));
      return Number(day.slice(8)) === Math.min(want, last);
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
    default: return '';
  }
}

/** Dữ liệu gọn gửi lên /cal/task.ics (chỉ phần cần cho sự kiện) */
export function reminderPayload(t, roomName = '') {
  const cut = (s, n) => String(s || '').slice(0, n);
  return {
    t: cut(t.title, 120), d: cut(t.desc, 400), r: cut(roomName, 60), s: t.date, h: t.time || '',
    p: t.repeat && t.repeat !== 'none' ? t.repeat : '', u: t.until || '', m: t.remind ?? null,
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
