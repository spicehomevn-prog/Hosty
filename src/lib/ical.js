import { toKey } from './dates.js';

const unescape = (v) => v.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');

function parseDate(value, params) {
  const v = value.trim();
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (!h || /VALUE=DATE(?!-)/i.test(params)) return `${y}-${mo}-${d}`;
  const date = z
    ? new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s || 0)))
    : new Date(+y, +mo - 1, +d, +h, +mi, +(s || 0));
  return toKey(date);
}

/** Phân tích nội dung .ics -> danh sách sự kiện { uid, start, end, summary, description } (end = ngày trả phòng) */
export function parseICS(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const events = [];
  let cur = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') {
      if (cur && cur.start) {
        if (!cur.end || cur.end <= cur.start) {
          const d = new Date(+cur.start.slice(0, 4), +cur.start.slice(5, 7) - 1, +cur.start.slice(8) + 1);
          cur.end = toKey(d);
        }
        events.push(cur);
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const left = line.slice(0, idx);
    const value = line.slice(idx + 1);
    const [name, ...rest] = left.split(';');
    const params = rest.join(';');
    switch (name.toUpperCase()) {
      case 'UID': cur.uid = value.trim(); break;
      case 'DTSTART': cur.start = parseDate(value, params); break;
      case 'DTEND': cur.end = parseDate(value, params); break;
      case 'SUMMARY': cur.summary = unescape(value).trim(); break;
      case 'DESCRIPTION': cur.description = unescape(value).trim(); break;
      default: break;
    }
  }
  return events;
}

/** Sự kiện "khoá phòng" (không phải đặt phòng thật) của các sàn */
// Airbnb: "Airbnb (Not available)" = ngày bị chặn / lịch nhập từ sàn khác.
// Booking.com dùng "CLOSED - Not available" cho cả đặt phòng thật nên vẫn tính là đặt phòng
// (có thể đánh dấu "khoá phòng" thủ công trong chi tiết đặt phòng).
export const isBlockEvent = (summary = '') =>
  /^\s*(airbnb\s*)?\(not available\)\s*$|^\s*(blocked|not available|unavailable|không khả dụng)\s*$/i.test(summary);

export async function fetchCalendar(url) {
  const r = await fetch(`/api/ical?url=${encodeURIComponent(url.trim())}`);
  const text = await r.text();
  if (!r.ok) {
    let msg = 'Không tải được lịch';
    try { msg = JSON.parse(text).error || msg; } catch { /* noop */ }
    throw new Error(msg);
  }
  return parseICS(text);
}
