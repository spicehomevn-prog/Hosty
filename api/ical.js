// Vercel Serverless Function: proxy tải file iCal (tránh lỗi CORS khi gọi từ trình duyệt)
// GET /api/ical?url=<link ical>
// GET /api/ical?ws=<id>&cal=<id lịch>  -> máy chủ tự tra link (tài khoản Dọn phòng không nhận link sàn):
//   chỉ lịch của phòng trong phạm vi địa điểm được gán; Dọn phòng nhận bản không có tên khách / mô tả.
import { fetchIcs, FetchIcsError } from './_fetchics.js';
import { requireUser, canAccess, wsFile } from './_auth.js';
import { getJSON } from './_store.js';
import { eventsOf } from './_feeds.js';
import { roomScope, isCleanerUser, cleanerSummary } from './_scope.js';

function send(res, status, body, headers = {}) {
  res.statusCode = status;
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(body);
}
const err = (status, message) => Object.assign(new Error(message), { status });
const icsDate = (d) => d.replace(/-/g, '');
const esc = (s) => String(s || '').replace(/[\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');

/** Lịch theo id (máy chủ đọc link, đệm 15 phút) */
async function byId(user, ws, calId) {
  if (!ws || !canAccess(user, ws)) throw err(403, 'Không có quyền với cơ sở này');
  const cur = await getJSON(wsFile(ws), { etag: false });
  const data = cur?.data?.data;
  const cal = (data?.calendars || []).find((c) => c.id === calId);
  if (!cal || !cal.url) throw err(404, 'Không tìm thấy lịch');
  const rooms = roomScope(data, user);
  if (rooms && !rooms.has(cal.roomId)) throw err(403, 'Lịch này không thuộc địa điểm được giao');
  const cleaner = isCleanerUser(user);
  const events = await eventsOf(cal, { maxAge: 15 * 60e3 });
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Hostexa//cleaning//VI'];
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${esc(e.uid || `${e.start}-${e.end}`)}`, `DTSTART;VALUE=DATE:${icsDate(e.start)}`, `DTEND;VALUE=DATE:${icsDate(e.end)}`,
      `SUMMARY:${esc(cleaner ? cleanerSummary(e.summary) : e.summary)}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export default async function handler(req, res) {
  const reqUrl = new URL(req.url, 'http://localhost');
  const q = reqUrl.searchParams;
  try {
    // chỉ người đã đăng nhập mới dùng được (không làm proxy mở cho người ngoài)
    const user = await requireUser(req);
    let text;
    if (q.get('cal')) text = await byId(user, q.get('ws'), q.get('cal'));
    else {
      if (isCleanerUser(user)) throw err(403, 'Tài khoản dọn phòng không tải lịch theo link');
      text = await fetchIcs(q.get('url'));
    }
    return send(res, 200, text, {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'private, no-store',
    });
  } catch (e) {
    const status = e instanceof FetchIcsError ? e.status : (e.status || 502);
    return send(res, status, JSON.stringify({ error: e.message || 'Không tải được lịch' }), { 'Content-Type': 'application/json' });
  }
}
