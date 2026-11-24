// Lịch iCal của sàn đọc ở máy chủ, có bộ nhớ đệm trên Blob (feedcache/<id lịch>.json).
import { getJSON, putJSON } from './_store.js';
import { fetchIcs } from './_fetchics.js';
import { parseICS } from '../src/lib/ical.js';

/**
 * Sự kiện của một lịch sàn: [{ uid, start, end, summary }].
 * - maxAge (ms): bản đệm còn mới hơn thì dùng luôn, không tải lại (0 = luôn tải).
 * - Tải lỗi -> dùng bản tải được gần nhất (để không lỡ mở lại ngày đã có khách).
 */
const lastSaved = new Map(); // calId -> nội dung đã ghi gần nhất (trong instance) – không ghi lại nếu không đổi
export async function eventsOf(cal, { maxAge = 0 } = {}) {
  const cacheName = `feedcache/${cal.id}.json`;
  let cached = null;
  if (maxAge > 0) {
    cached = await getJSON(cacheName, { etag: false }).catch(() => null);
    if (cached?.data?.at && Date.now() - cached.data.at < maxAge && cached.data.full) return cached.data.events || [];
  }
  try {
    const fetched = parseICS(await fetchIcs(cal.url)).map((e) => ({ uid: e.uid || '', start: e.start, end: e.end, summary: String(e.summary || '').slice(0, 120) }));
    const sig = JSON.stringify(fetched);
    let events = fetched;
    // ghi đệm khi nội dung đổi, hoặc bản đệm đã quá 1 giờ (để lượt đọc theo maxAge vẫn thấy còn mới)
    const prev = lastSaved.get(cal.id);
    const write = !prev || prev.sig !== sig || Date.now() - prev.at > 3600e3;
    if (write || cached) {
      // giữ lại khách đang ở mà sàn đã bỏ khỏi iCal (có sàn bỏ đặt phòng đã nhận phòng / vào ngày trả phòng)
      // -> vẫn báo được "trả phòng" hôm nay. Chỉ giữ tới hết ngày trả phòng.
      const old = cached || await getJSON(cacheName, { etag: false }).catch(() => null);
      events = keepStays(fetched, old?.data?.events);
    }
    if (write) {
      lastSaved.set(cal.id, { sig, at: Date.now() });
      putJSON(cacheName, { at: Date.now(), full: true, events }).catch(() => {});
    }
    return events;
  } catch {
    const c = cached || await getJSON(cacheName, { etag: false }).catch(() => null);
    return c?.data?.events || [];
  }
}

/** Gộp: sự kiện mới tải + khách đang ở (đã nhận phòng, chưa qua ngày trả) có trong bản đệm cũ nhưng sàn đã bỏ */
export function keepStays(fresh, old, now = Date.now()) {
  if (!Array.isArray(old) || !old.length) return fresh;
  const today = new Date(now + 7 * 3600e3).toISOString().slice(0, 10);
  const uids = new Set(fresh.map((e) => e.uid).filter(Boolean));
  const keys = new Set(fresh.map((e) => `${e.start}|${e.end}`));
  const kept = old.filter((e) => e.start && e.end && e.start < today && e.end >= today
    && !(e.uid && uids.has(e.uid)) && !keys.has(`${e.start}|${e.end}`));
  return kept.length ? [...fresh, ...kept.map((e) => ({ ...e, kept: 1 }))] : fresh;
}
