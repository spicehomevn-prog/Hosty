import { isBlockEvent } from './ical.js';
import { platformColor } from './store.jsx';
import { dm, longDate, wdLong, addDays } from './dates.js';

export function roomIndex(state) {
  const map = {};
  for (const loc of state.locations) for (const room of loc.rooms) map[room.id] = { room, location: loc };
  return map;
}

export const allRooms = (state, locationId) =>
  state.locations.filter((l) => !locationId || l.id === locationId).flatMap((l) => l.rooms.map((r) => ({ ...r, location: l })));

/** Sự kiện iCal có tiêu đề chung chung (không có tên khách) – kiểu lịch khoá các sàn trả ngược về */
const GENERIC = /^\s*(closed\s*-\s*)?(airbnb\s*)?\(?(not available|unavailable|blocked|closed|không khả dụng)\)?(\s*\(hostexa\))?\s*$/i;

/** Mọi đêm trong [start, end) đều nằm trong các đặt phòng trực tiếp `list` (cùng phòng) */
export function coveredByDirect(start, end, list) {
  if (!list?.length) return false;
  for (let d = start; d < end; d = addDays(d, 1)) {
    if (!list.some((m) => m.start <= d && m.end > d)) return false;
  }
  return true;
}

/**
 * Gộp tất cả đặt phòng từ iCal + nhập tay, loại trùng giữa các sàn.
 * Đặt phòng trực tiếp được Hostexa xuất lên các sàn; sàn chặn ngày rồi trả ngược về trong iCal của nó
 * ("Airbnb (Not available)", Booking.com "CLOSED - Not available"). Những sự kiện đó nằm trọn trong
 * đặt phòng trực tiếp của cùng phòng -> ẩn, để không hiện trùng và không tính 2 lần.
 */
export function getBookings(state) {
  const manualByRoom = {};
  for (const m of state.manual) (manualByRoom[m.roomId] ||= []).push(m);
  const raw = [];
  for (const cal of state.calendars) {
    for (const e of state.events[cal.id] || []) {
      const id = `${cal.id}:${e.uid || e.start}`;
      const ov = state.overrides[id] || {};
      const blocked = ov.blocked ?? isBlockEvent(e.summary);
      const echo = ov.blocked !== false && (blocked || GENERIC.test(e.summary || '')) && coveredByDirect(e.start, e.end, manualByRoom[cal.roomId]);
      if (echo) continue;
      raw.push({
        id, roomId: cal.roomId, calendarId: cal.id, platform: cal.platform || 'Khác',
        start: e.start, end: e.end, summary: e.summary || '', description: e.description || '',
        checkIn: cal.checkIn || '14:00', checkOut: cal.checkOut || '12:00',
        blocked, source: 'ical',
      });
    }
  }
  for (const m of state.manual) {
    raw.push({ ...m, summary: m.guest || 'Khách đặt trực tiếp', description: m.note || '', blocked: false, source: 'manual', platform: m.platform || 'Trực tiếp' });
  }
  // loại trùng: cùng phòng + cùng ngày -> ưu tiên đặt phòng thật hơn lịch khoá, đặt phòng trực tiếp hơn iCal
  const rank = (b) => (b.blocked ? 2 : 0) + (b.source === 'manual' ? 0 : 1);
  raw.sort((a, b) => rank(a) - rank(b));
  const seen = new Set();
  const out = [];
  for (const b of raw) {
    const k = `${b.roomId}|${b.start}|${b.end}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ ...b, color: b.blocked ? '#B7B2C6' : platformColor(b.platform) });
  }
  return out.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
}

/**
 * Thẻ dọn phòng trong khoảng [from, to]:
 * - mỗi lượt khách trả phòng (không phải lịch khoá) -> một thẻ, ngày = ngày trả phòng;
 * - admin có thể xoá thẻ (cleanAdj[id].hide) hoặc dời ngày (cleanAdj[id].date);
 * - thẻ admin thêm tay (cleanExtra).
 */
export function getCleanings(state, bookings, from, to, locationId) {
  const idx = roomIndex(state);
  const real = bookings.filter((b) => !b.blocked && idx[b.roomId]);
  const adj = state.cleanAdj || {};
  const nextAfter = (roomId, day, exceptId) => real
    .filter((n) => n.roomId === roomId && n.start >= day && n.id !== exceptId)
    .sort((x, y) => (x.start < y.start ? -1 : 1))[0] || null;
  const doneOf = (id) => ({ done: !!state.cleanDone[id], doneInfo: typeof state.cleanDone[id] === 'object' ? state.cleanDone[id] : null });
  const map = {};
  for (const b of real) {
    const id = `${b.end}|${b.roomId}`;
    if (map[id]) continue;
    const a = adj[id];
    if (a?.hide) continue;
    const date = a?.date || b.end;
    if (date < from || date > to) continue;
    const loc = idx[b.roomId].location;
    if (locationId && loc.id !== locationId) continue;
    const next = nextAfter(b.roomId, b.end, b.id);
    const sameDay = next && next.start === date;
    map[id] = {
      id, date, origDate: b.end, moved: !!a?.date && a.date !== b.end, roomId: b.roomId, room: idx[b.roomId].room, location: loc,
      outTime: b.checkOut, outPlatform: b.platform, outBooking: b,
      next, sameDay: !!sameDay, inTime: sameDay ? next.checkIn : null, ...doneOf(id), note: state.cleanNotes?.[id] || '',
    };
  }
  for (const x of state.cleanExtra || []) {
    if (!idx[x.roomId] || x.date < from || x.date > to) continue;
    const loc = idx[x.roomId].location;
    if (locationId && loc.id !== locationId) continue;
    const next = nextAfter(x.roomId, x.date);
    const sameDay = next && next.start === x.date;
    map[x.id] = {
      id: x.id, date: x.date, roomId: x.roomId, room: idx[x.roomId].room, location: loc, custom: true, note: x.note || '',
      outTime: x.time || '', outPlatform: 'Thêm tay', outBooking: null,
      next, sameDay: !!sameDay, inTime: sameDay ? next.checkIn : null, ...doneOf(x.id),
    };
  }
  const t = (c) => c.outTime || '99:99';
  return Object.values(map).sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? -1 : 1)
      : a.sameDay !== b.sameDay ? (a.sameDay ? -1 : 1)
        : t(a).localeCompare(t(b)),
  );
}

export const occupiedOn = (bookings, day) => bookings.filter((b) => !b.blocked && b.start <= day && b.end > day);
export const arrivalsOn = (bookings, day) => bookings.filter((b) => !b.blocked && b.start === day);
export const departuresOn = (bookings, day) => bookings.filter((b) => !b.blocked && b.end === day);

export function cleaningStatus(c) {
  if (c.sameDay) return { tone: 'pink', label: `Gấp · khách mới nhận ${c.inTime}` };
  if (c.next) {
    const d = c.next.start;
    return { tone: 'violet', label: d === addDays(c.date, 1) ? `Khách tiếp theo: ngày mai ${c.next.checkIn}` : `Khách tiếp theo: ${dm(d)}` };
  }
  return { tone: 'blue', label: 'Chưa có khách tiếp theo' };
}

/** Nội dung copy thẻ dọn phòng để gửi Zalo/Messenger cho nhân viên */
export function cleaningText(state, cards, { title, notes = {} } = {}) {
  const lines = [];
  if (title) lines.push(`🧹 ${title}`);
  if (state.property?.name) lines.push(`🏡 ${state.property.name}`);
  const byDate = {};
  for (const c of cards) (byDate[c.date] ||= []).push(c);
  const dates = Object.keys({ ...byDate }).sort();
  for (const date of dates) {
    lines.push('', `📅 ${longDate(date)}`);
    const byLoc = {};
    for (const c of byDate[date]) (byLoc[c.location.name] ||= []).push(c);
    for (const [locName, list] of Object.entries(byLoc)) {
      if (state.locations.length > 1) lines.push(`📍 ${locName}`);
      for (const c of list) {
        const st = c.sameDay
          ? `⚠️ GẤP – khách mới nhận ${c.inTime}`
          : c.next ? `khách tiếp theo ${dm(c.next.start)}` : 'chưa có khách tiếp theo';
        lines.push(c.custom
          ? `${c.done ? '✅' : '▫️'} ${c.room.name}: dọn${c.outTime ? ` lúc ${c.outTime}` : ''} → ${st}`
          : `${c.done ? '✅' : '▫️'} ${c.room.name}: khách trả ${c.outTime} → ${st}`);
        if (c.note) lines.push(`   📝 ${c.note}`);
      }
    }
    if (notes[date]) lines.push(`📝 Ghi chú: ${notes[date].trim()}`);
  }
  if (!cards.length) lines.push('', 'Không có phòng cần dọn.');
  return lines.join('\n');
}

export const weekdayName = wdLong;

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}
