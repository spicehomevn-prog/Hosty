// Lịch iCal XUẤT từ Hostexa cho các sàn (Airbnb, Booking.com, Agoda…) tự đọc để chặn ngày.
// GET /cal/<token>.ics   (rewrite -> /api/ical-out?k=<token>)
// Gồm: đặt phòng trực tiếp + đặt phòng / ngày khoá từ các sàn khác của cùng phòng,
// trừ lịch của chính sàn nhận link (x) và trừ các ngày trùng khớp với lịch của sàn đó (bản chép ngược).
import { createHash } from 'node:crypto';
import { getJSON, putJSON } from './_store.js';
import { verifyFeed, wsFile } from './_auth.js';
import { fetchIcs } from './_fetchics.js';
import { parseICS } from '../src/lib/ical.js';

const CRLF = '\r\n';
const ymd = (k) => k.replace(/-/g, '');
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

function sendText(res, status, text, extra = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', status === 200 ? 'text/calendar; charset=utf-8' : 'text/plain; charset=utf-8');
  for (const [k, v] of Object.entries(extra)) res.setHeader(k, v);
  res.end(text);
}

/** Tải lịch của sàn; lỗi thì dùng bản tải được gần nhất để không lỡ mở lại ngày đã có khách */
async function eventsOf(cal) {
  const cacheName = `feedcache/${cal.id}.json`;
  try {
    const events = parseICS(await fetchIcs(cal.url)).map((e) => ({ start: e.start, end: e.end }));
    putJSON(cacheName, { at: Date.now(), events }).catch(() => {});
    return events;
  } catch {
    const c = await getJSON(cacheName).catch(() => null);
    return c?.data?.events || [];
  }
}

export default async function handler(req, res) {
  try {
    const u = new URL(req.url, 'http://localhost');
    const token = (u.searchParams.get('k') || u.pathname.split('/').pop() || '').replace(/\.ics$/i, '');
    const p = verifyFeed(token);
    if (!p?.w || !p?.r) return sendText(res, 404, 'Không tìm thấy lịch');
    const cur = await getJSON(wsFile(p.w));
    const data = cur?.data?.data;
    const room = data?.locations?.flatMap((l) => l.rooms || []).find((r) => r.id === p.r);
    if (!room) return sendText(res, 404, 'Không tìm thấy phòng');

    const cals = (data.calendars || []).filter((c) => c.roomId === p.r && c.url);
    const lists = await Promise.all(cals.map(async (c) => ({ cal: c, events: await eventsOf(c) })));
    const own = new Set((lists.find((l) => l.cal.id === p.x)?.events || []).map((e) => `${e.start}|${e.end}`));

    const today = new Date().toISOString().slice(0, 10);
    const cutoff = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    const ranges = new Map();
    const add = (start, end) => {
      if (!start || !end || end <= start || end < cutoff) return;
      const k = `${start}|${end}`;
      if (own.has(k)) return; // bản chép ngược đặt phòng của chính sàn nhận link
      ranges.set(k, { start, end });
    };
    for (const l of lists) if (l.cal.id !== p.x) for (const e of l.events) add(e.start, e.end);
    for (const m of data.manual || []) if (m.roomId === p.r) add(m.start, m.end);

    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Hostexa//Lich phong//VI', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      `X-WR-CALNAME:${esc(`Hostexa - ${room.name}`)}`,
    ];
    for (const { start, end } of [...ranges.values()].sort((a, b) => (a.start < b.start ? -1 : 1))) {
      const uid = createHash('sha1').update(`${p.r}|${start}|${end}`).digest('hex').slice(0, 20);
      lines.push('BEGIN:VEVENT', `UID:${uid}@hostexa`, `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${ymd(start)}`, `DTEND;VALUE=DATE:${ymd(end)}`,
        'SUMMARY:Not available (Hostexa)', 'TRANSP:OPAQUE', 'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return sendText(res, 200, lines.join(CRLF) + CRLF, {
      'Cache-Control': 's-maxage=300, stale-while-revalidate=600',
      'Content-Disposition': `inline; filename="hostexa-${today}.ics"`,
    });
  } catch (e) {
    console.error('ical-out error', e);
    return sendText(res, 500, 'Lỗi máy chủ khi tạo lịch');
  }
}
