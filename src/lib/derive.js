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

/** Gộp tất cả đặt phòng từ iCal + nhập tay, loại trùng giữa các sàn */
export function getBookings(state) {
  const raw = [];
  for (const cal of state.calendars) {
    for (const e of state.events[cal.id] || []) {
      const id = `${cal.id}:${e.uid || e.start}`;
      const ov = state.overrides[id] || {};
      raw.push({
        id, roomId: cal.roomId, calendarId: cal.id, platform: cal.platform || 'Khác',
        start: e.start, end: e.end, summary: e.summary || '', description: e.description || '',
        checkIn: cal.checkIn || '14:00', checkOut: cal.checkOut || '12:00',
        blocked: ov.blocked ?? isBlockEvent(e.summary), source: 'ical',
      });
    }
  }
  for (const m of state.manual) {
    raw.push({ ...m, summary: m.guest || 'Khách đặt trực tiếp', description: m.note || '', blocked: false, source: 'manual', platform: m.platform || 'Trực tiếp' });
  }
  // loại trùng: cùng phòng + cùng ngày -> ưu tiên đặt phòng thật hơn lịch khoá
  raw.sort((a, b) => Number(a.blocked) - Number(b.blocked));
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

/** Thẻ dọn phòng: mỗi lượt khách trả phòng (không phải lịch khoá) trong khoảng [from, to] */
export function getCleanings(state, bookings, from, to, locationId) {
  const idx = roomIndex(state);
  const real = bookings.filter((b) => !b.blocked && idx[b.roomId]);
  const map = {};
  for (const b of real) {
    if (b.end < from || b.end > to) continue;
    const loc = idx[b.roomId].location;
    if (locationId && loc.id !== locationId) continue;
    const id = `${b.end}|${b.roomId}`;
    if (map[id]) continue;
    const next = real
      .filter((n) => n.roomId === b.roomId && n.start >= b.end && n.id !== b.id)
      .sort((x, y) => (x.start < y.start ? -1 : 1))[0];
    const sameDay = next && next.start === b.end;
    map[id] = {
      id, date: b.end, roomId: b.roomId, room: idx[b.roomId].room, location: loc,
      outTime: b.checkOut, outPlatform: b.platform, outBooking: b,
      next: next || null, sameDay: !!sameDay, inTime: sameDay ? next.checkIn : null,
      done: !!state.cleanDone[id],
    };
  }
  return Object.values(map).sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? -1 : 1)
      : a.sameDay !== b.sameDay ? (a.sameDay ? -1 : 1)
        : a.outTime.localeCompare(b.outTime),
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
        lines.push(`${c.done ? '✅' : '▫️'} ${c.room.name}: khách trả ${c.outTime} → ${st}`);
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
