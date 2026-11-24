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
    const events = parseICS(await fetchIcs(cal.url)).map((e) => ({ uid: e.uid || '', start: e.start, end: e.end, summary: String(e.summary || '').slice(0, 120) }));
    const sig = JSON.stringify(events);
    // ghi đệm khi nội dung đổi, hoặc bản đệm đã quá 1 giờ (để lượt đọc theo maxAge vẫn thấy còn mới)
    const prev = lastSaved.get(cal.id);
    if (!prev || prev.sig !== sig || Date.now() - prev.at > 3600e3) {
      lastSaved.set(cal.id, { sig, at: Date.now() });
      putJSON(cacheName, { at: Date.now(), full: true, events }).catch(() => {});
    }
    return events;
  } catch {
    const c = cached || await getJSON(cacheName, { etag: false }).catch(() => null);
    return c?.data?.events || [];
  }
}
