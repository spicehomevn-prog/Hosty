// Lịch iCal XUẤT từ Hostexa cho các sàn (Airbnb, Booking.com, Agoda…) tự đọc để chặn ngày.
// GET /cal/<token>.ics   (rewrite -> /api/ical-out?k=<token>)
// Gồm: đặt phòng trực tiếp + đặt phòng / ngày khoá từ các sàn khác của cùng phòng,
// trừ lịch của chính sàn nhận link (x) và trừ các ngày trùng khớp với lịch của sàn đó (bản chép ngược).
import { createHash } from 'node:crypto';
import { getJSON } from './_store.js';
import { verifyFeed, wsFile } from './_auth.js';
import { eventsOf } from './_feeds.js';

const CRLF = '\r\n';
const ymd = (k) => k.replace(/-/g, '');
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

function sendText(res, status, text, extra = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', status === 200 ? 'text/calendar; charset=utf-8' : 'text/plain; charset=utf-8');
  for (const [k, v] of Object.entries(extra)) res.setHeader(k, v);
  res.end(text);
}


/* ---------- Lời nhắc task cho lịch điện thoại: GET /cal/task.ics?d=<base64url JSON> ----------
 * Không cần đăng nhập: chỉ chứa nội dung task người dùng tự gửi lên (tiêu đề, giờ, lặp lại, nhắc trước).
 * iPhone mở link -> "Thêm vào Lịch"; Android tải tệp -> mở bằng Google Calendar. */
const TZ = 'Asia/Ho_Chi_Minh';
const VTZ = ['BEGIN:VTIMEZONE', `TZID:${TZ}`, 'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:+0700', 'TZOFFSETTO:+0700', 'TZNAME:ICT', 'END:STANDARD', 'END:VTIMEZONE'];
const fold = (line) => { // dòng iCal tối đa 75 byte
  const out = []; let cur = '';
  for (const ch of line) { if (Buffer.byteLength(cur + ch) > 73) { out.push(cur); cur = ` ${ch}`; } else cur += ch; }
  out.push(cur); return out.join(CRLF);
};
function taskRrule(p) {
  if (!p.p) return '';
  const until = /^\d{4}-\d{2}-\d{2}$/.test(p.u || '') ? `;UNTIL=${ymd(p.u)}T235959Z` : '';
  const wdDay = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][new Date(`${p.s}T00:00:00Z`).getUTCDay()];
  const day = Number(p.s.slice(8));
  return ({
    daily: `FREQ=DAILY${until}`,
    weekdays: `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR${until}`,
    weekly: `FREQ=WEEKLY;BYDAY=${wdDay}${until}`,
    monthly: day > 28 ? `FREQ=MONTHLY;BYMONTHDAY=${day},-1;BYSETPOS=1${until}` : `FREQ=MONTHLY;BYMONTHDAY=${day}${until}`,
  })[p.p] || '';
}
function sendTaskReminder(res, d) {
  let p;
  try {
    if (!d || d.length > 3000) throw new Error();
    p = JSON.parse(Buffer.from(d, 'base64url').toString('utf8'));
  } catch { return sendText(res, 400, 'Dữ liệu lời nhắc không hợp lệ'); }
  const str = (v, n) => String(v ?? '').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').slice(0, n);
  const title = str(p.t, 120) || 'Task Hostexa';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.s || '')) return sendText(res, 400, 'Thiếu ngày của task');
  const time = /^\d{2}:\d{2}$/.test(p.h || '') ? p.h : '';
  const remind = [0, 5, 15, 30, 60, 120, 1440].includes(p.m) ? p.m : null;
  const room = str(p.r, 60);
  const desc = `${str(p.d, 400)}${p.d ? '\n\n' : ''}Task Hostexa · https://hostexa.vercel.app`;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const uid = createHash('sha1').update(`${title}|${p.s}|${time}|${p.p}`).digest('hex').slice(0, 20);
  const ev = ['BEGIN:VEVENT', `UID:task-${uid}@hostexa`, `DTSTAMP:${stamp}`, fold(`SUMMARY:${esc(room ? `${title} – ${room}` : title)}`), fold(`DESCRIPTION:${esc(desc)}`)];
  if (time) {
    ev.push(`DTSTART;TZID=${TZ}:${ymd(p.s)}T${time.replace(':', '')}00`, 'DURATION:PT30M');
  } else {
    const next = new Date(`${p.s}T00:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
    ev.push(`DTSTART;VALUE=DATE:${ymd(p.s)}`, `DTEND;VALUE=DATE:${next.toISOString().slice(0, 10).replace(/-/g, '')}`);
  }
  const rr = taskRrule(p);
  if (rr) ev.push(`RRULE:${rr}`);
  if (remind != null) {
    ev.push('BEGIN:VALARM', 'ACTION:DISPLAY', fold(`DESCRIPTION:${esc(title)}`), `TRIGGER:${remind ? `-PT${remind}M` : 'PT0M'}`, 'END:VALARM');
  }
  ev.push('END:VEVENT');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Hostexa//Task//VI', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', ...(time ? VTZ : []), ...ev, 'END:VCALENDAR'];
  return sendText(res, 200, lines.join(CRLF) + CRLF, {
    'Cache-Control': 'no-store',
    'Content-Disposition': 'inline; filename="hostexa-task.ics"',
  });
}

export default async function handler(req, res) {
  try {
    const u = new URL(req.url, 'http://localhost');
    const token = (u.searchParams.get('k') || u.pathname.split('/').pop() || '').replace(/\.ics$/i, '');
    if (token === 'task') return sendTaskReminder(res, u.searchParams.get('d'));
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
