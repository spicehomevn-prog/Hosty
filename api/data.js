// Dữ liệu của từng cơ sở
// GET /api/data?ws=ID                       -> { version, updatedAt, updatedBy, data }
// PUT /api/data { ws, baseVersion, data }   -> { version, updatedAt }   (409 nếu bản trên máy chủ đã đổi)
import { route, send, readBody, query, HttpError, MAX_BYTES } from './_http.js';
import { getJSON, putJSON, ConflictError } from './_store.js';
import { requireUser, canAccess, loadWorkspaces, wsFile, signFeed } from './_auth.js';
import { siteUrl } from '../site.config.js';

export const SYNC_KEYS = ['property', 'locations', 'calendars', 'manual', 'overrides', 'notes', 'tasks', 'cleanDone', 'setupDone'];
const TASK_TICK_FIELDS = new Set(['done', 'doneAt', 'doneBy', 'doneByName']);

const pick = (d) => Object.fromEntries(SYNC_KEYS.filter((k) => d[k] !== undefined).map((k) => [k, d[k]]));

function deepEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return (a ?? null) === (b ?? null);
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  if (typeof a === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) if (!deepEqual(a[k], b[k])) return false;
    return true;
  }
  return false;
}

/** Member chỉ được: tick dọn phòng (cleanDone) và tick task chung / task giao cho mình */
function checkMemberChange(prev, next, user) {
  for (const k of SYNC_KEYS) {
    if (k === 'cleanDone' || k === 'tasks') continue;
    if (!deepEqual(prev[k], next[k])) throw new HttpError(403, 'Tài khoản dọn phòng không được sửa mục này');
  }
  const before = new Map((prev.tasks || []).map((t) => [t.id, t]));
  const after = next.tasks || [];
  if (after.length !== before.size) throw new HttpError(403, 'Tài khoản dọn phòng không được thêm/xoá task');
  for (const t of after) {
    const old = before.get(t.id);
    if (!old) throw new HttpError(403, 'Tài khoản dọn phòng không được thêm task');
    const keys = new Set([...Object.keys(old), ...Object.keys(t)]);
    let ticked = false;
    for (const k of keys) {
      if (deepEqual(old[k], t[k])) continue;
      if (!TASK_TICK_FIELDS.has(k)) throw new HttpError(403, 'Tài khoản dọn phòng chỉ được đánh dấu hoàn thành task');
      ticked = true;
    }
    if (ticked && old.assignee && old.assignee !== user.id) throw new HttpError(403, 'Task này được giao cho người khác');
  }
}

/** Link xuất lịch iCal cho từng phòng (chỉ admin cơ sở / chủ hệ thống) */
function exportLinks(req, user, ws, data) {
  if (user.role === 'member') throw new HttpError(403, 'Chỉ admin cơ sở xem được link xuất lịch');
  if (!data) return [];
  // Link mới luôn dùng tên miền chính (link cũ trên tên miền khác vẫn hợp lệ). Chạy local thì dùng địa chỉ đang mở.
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '');
  const local = /^(localhost|127\.|192\.168\.|10\.)/.test(host);
  const base = local ? `http://${host}` : siteUrl();
  const url = (payload) => `${base}/cal/${signFeed(payload)}.ics`;
  const out = [];
  for (const loc of data.locations || []) {
    for (const room of loc.rooms || []) {
      const cals = (data.calendars || []).filter((c) => c.roomId === room.id && c.url);
      out.push({
        roomId: room.id, roomName: room.name, locationName: loc.name,
        all: url({ w: ws, r: room.id }),
        calendars: cals.map((c) => ({ id: c.id, platform: c.platform, url: url({ w: ws, r: room.id, x: c.id }) })),
      });
    }
  }
  return out;
}

export default route(async (req, res) => {
  const user = await requireUser(req);

  if (req.method === 'GET') {
    const ws = query(req).get('ws');
    if (!ws || !canAccess(user, ws)) throw new HttpError(403, 'Không có quyền với cơ sở này');
    const cur = await getJSON(wsFile(ws));
    if (query(req).get('links')) return send(res, 200, { links: exportLinks(req, user, ws, cur?.data?.data) });
    if (!cur) return send(res, 200, { version: 0, updatedAt: 0, updatedBy: '', data: null });
    const { version, updatedAt, updatedBy, data } = cur.data;
    return send(res, 200, { version, updatedAt, updatedBy, data });
  }

  if (req.method === 'PUT') {
    const body = await readBody(req);
    const { ws } = body;
    if (!ws || !canAccess(user, ws)) throw new HttpError(403, 'Không có quyền với cơ sở này');
    const { workspaces } = await loadWorkspaces();
    if (!workspaces.some((w) => w.id === ws)) throw new HttpError(404, 'Cơ sở không còn tồn tại');
    if (!body.data || typeof body.data !== 'object' || !Array.isArray(body.data.locations)) {
      throw new HttpError(400, 'Dữ liệu không hợp lệ');
    }
    const data = pick(body.data);
    if (JSON.stringify(data).length > MAX_BYTES) throw new HttpError(413, 'Dữ liệu quá lớn');

    const cur = await getJSON(wsFile(ws));
    const curVersion = cur ? cur.data.version : 0;
    const conflict = () => new HttpError(409, 'Dữ liệu trên máy chủ đã thay đổi', {
      version: curVersion, updatedAt: cur?.data.updatedAt || 0, updatedBy: cur?.data.updatedBy || '', data: cur?.data.data || null,
    });
    if (Number(body.baseVersion || 0) !== curVersion) throw conflict();

    if (user.role === 'member') {
      if (!cur) throw new HttpError(403, 'Cơ sở chưa được admin thiết lập');
      checkMemberChange(cur.data.data || {}, data, user);
    }

    const doc = { version: curVersion + 1, updatedAt: Date.now(), updatedBy: user.name || user.username, data };
    try {
      await putJSON(wsFile(ws), doc, cur ? { ifMatch: cur.etag } : { create: true });
    } catch (e) {
      if (e instanceof ConflictError) {
        const fresh = await getJSON(wsFile(ws));
        throw new HttpError(409, 'Dữ liệu trên máy chủ đã thay đổi', {
          version: fresh?.data.version || 0, updatedAt: fresh?.data.updatedAt || 0, updatedBy: fresh?.data.updatedBy || '', data: fresh?.data.data || null,
        });
      }
      throw e;
    }
    return send(res, 200, { version: doc.version, updatedAt: doc.updatedAt, updatedBy: doc.updatedBy });
  }

  res.setHeader('Allow', 'GET, PUT');
  throw new HttpError(405, 'Method not allowed');
});
