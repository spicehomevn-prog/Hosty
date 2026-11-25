// Phạm vi dữ liệu của tài khoản thành viên (Nhân viên / Dọn phòng):
// - account.locations: id địa điểm được gán (rỗng / thiếu = mọi địa điểm)
// - Dọn phòng (kind 'cleaner'): bỏ tên khách, số điện thoại, sàn và link iCal – chỉ còn việc dọn phòng
// Lọc ở máy chủ: dữ liệu ngoài phạm vi không bao giờ được gửi xuống máy của thành viên.
import { GENERIC } from '../src/lib/derive.js';
import { getJSON } from './_store.js';
import { wsFile } from './_auth.js';
import { HttpError } from './_http.js';

export const isMember = (u) => u?.role === 'member';
export const isCleanerUser = (u) => isMember(u) && u.kind !== 'staff';

/** Set id địa điểm được gán, hoặc null = toàn bộ */
export function scopeOf(user) {
  if (!isMember(user)) return null;
  const l = Array.isArray(user.locations) ? user.locations.filter(Boolean) : [];
  return l.length ? new Set(l) : null;
}

/** Set id phòng trong phạm vi, hoặc null = toàn bộ */
export function roomScope(data, user) {
  const s = scopeOf(user);
  if (!s) return null;
  const out = new Set();
  for (const loc of data?.locations || []) if (s.has(loc.id)) for (const r of loc.rooms || []) out.add(r.id);
  return out;
}

const PHONE = /(\+?84|0)[\s.-]?\d{2,3}([\s.-]?\d{2,4}){2,3}|\b\d{3}\s?x{2,3}\s?\d{3}\b/gi;
export const stripPhone = (s) => String(s || '').replace(PHONE, '').replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').trim();

/** Khoá dạng "<ngày>|<roomId>" (thẻ dọn phòng) hoặc id thẻ thêm tay */
const roomOfCleanKey = (k, extraRoom) => (k.includes('|') ? k.split('|').pop() : extraRoom.get(k));

/** Tiêu đề sự kiện iCal cho Dọn phòng: giữ chữ chung chung (để nhận ra lịch khoá), còn lại thay bằng "Khách" */
export const cleanerSummary = (s) => (GENERIC.test(s || '') ? s : 'Khách');

/** Dữ liệu cơ sở trong phạm vi tài khoản (admin / owner: nguyên vẹn) */
export function scopeData(data, user) {
  if (!data || !isMember(user)) return data;
  const cleaner = isCleanerUser(user);
  const rooms = roomScope(data, user);
  if (!rooms && !cleaner) return data;
  const inRoom = (id) => !rooms || rooms.has(id);
  const s = scopeOf(user);
  const out = { ...data };
  if (rooms) out.locations = (data.locations || []).filter((l) => s.has(l.id));
  out.calendars = (data.calendars || []).filter((c) => inRoom(c.roomId));
  out.manual = (data.manual || []).filter((m) => inRoom(m.roomId));
  out.cleanExtra = (data.cleanExtra || []).filter((x) => inRoom(x.roomId));
  const extraRoom = new Map((data.cleanExtra || []).map((x) => [x.id, x.roomId]));
  const byKey = (obj) => Object.fromEntries(Object.entries(obj || {}).filter(([k]) => inRoom(roomOfCleanKey(k, extraRoom))));
  if (rooms) {
    out.cleanAdj = byKey(data.cleanAdj);
    out.cleanNotes = byKey(data.cleanNotes);
    out.cleanDone = byKey(data.cleanDone);
    const calIds = new Set(out.calendars.map((c) => c.id));
    const manualIds = new Set(out.manual.map((m) => m.id));
    out.overrides = Object.fromEntries(Object.entries(data.overrides || {}).filter(([k]) => manualIds.has(k) || calIds.has(k.split(':')[0])));
  }
  // task: chung (không gắn phòng) hoặc của phòng trong phạm vi; task giao cho người khác không gửi xuống
  out.tasks = (data.tasks || []).filter((t) => (!t.assignee || t.assignee === user.id) && (!t.roomId || inRoom(t.roomId)));
  if (cleaner) {
    out.calendars = out.calendars.map(({ url, platform, ...c }) => ({ ...c, platform: '', hasUrl: !!url })); // eslint-disable-line no-unused-vars
    out.manual = out.manual.map(({ guest, platform, ...m }) => ({ ...m, guest: '', platform: '', note: stripPhone(m.note) })); // eslint-disable-line no-unused-vars
  }
  return out;
}

/** Áp phần thay đổi của thành viên (đã kiểm tra trên bản lọc) lên dữ liệu đầy đủ: chỉ cleanDone + tick task */
export function applyMemberChange(full, scopedPrev, scopedNext, tickFields) {
  const out = { ...full };
  const done = { ...(full.cleanDone || {}) };
  const before = scopedPrev.cleanDone || {};
  const after = scopedNext.cleanDone || {};
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (after[k] === undefined) delete done[k]; else done[k] = after[k];
  }
  out.cleanDone = done;
  const ticks = new Map((scopedNext.tasks || []).map((t) => [t.id, t]));
  out.tasks = (full.tasks || []).map((t) => {
    const n = ticks.get(t.id);
    if (!n) return t;
    const m = { ...t };
    for (const f of tickFields) { if (n[f] === undefined) delete m[f]; else m[f] = n[f]; }
    return m;
  });
  return out;
}

/** Kiểm tra danh sách địa điểm gán cho thành viên: chỉ id có trong cơ sở; [] = mọi địa điểm */
export async function cleanLocations(ws, ids) {
  if (ids == null) return [];
  if (!Array.isArray(ids)) throw new HttpError(400, 'Danh sách địa điểm không hợp lệ');
  const cur = await getJSON(wsFile(ws), { etag: false });
  const have = new Set((cur?.data?.data?.locations || []).map((l) => l.id));
  const out = [...new Set(ids.map(String))];
  if (out.some((id) => !have.has(id))) throw new HttpError(400, 'Địa điểm không có trong cơ sở');
  return out.length === have.size ? [] : out; // chọn đủ mọi địa điểm = không giới hạn (địa điểm thêm sau cũng thấy)
}
