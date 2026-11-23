// Tài chính của từng cơ sở — CHỈ chủ hệ thống (owner) và admin cơ sở. Tài khoản dọn phòng luôn bị từ chối.
// Dữ liệu tách riêng khỏi ws/<id>.json (mà member tải về) để member không bao giờ nhận được số liệu tiền.
// GET /api/finance?ws=ID                    -> { version, updatedAt, updatedBy, data }
// PUT /api/finance { ws, baseVersion, data } -> { version, updatedAt }   (409 nếu bản trên máy chủ đã đổi)
// POST /api/finance?ws=ID&action=ota          -> lấy giá Airbnb theo ngày qua Apify ngay (tối đa 1 lần / giờ / cơ sở)
// GET /api/finance?cron=ota (Authorization: Bearer CRON_SECRET) -> Vercel Cron ngày 1 hằng tháng, mọi cơ sở
import { timingSafeEqual } from 'node:crypto';
import { route, send, readBody, query, HttpError, MAX_BYTES } from './_http.js';
import { getJSON, putJSON, updateJSON, ConflictError } from './_store.js';
import { requireUser, canAccess, loadWorkspaces, envClean } from './_auth.js';
import { resolveAirbnb, runAirbnbCalendars, OtaError } from './_apify.js';

export const FIN_KEYS = ['settings', 'rateTable', 'dayDiscount', 'stayDiscount', 'otaListings', 'otaRates', 'otaRun', 'prices', 'expenses', 'history', 'roomMap'];
export const finFile = (ws) => `fin/${ws}.json`;
const pick = (d) => Object.fromEntries(FIN_KEYS.filter((k) => d[k] !== undefined).map((k) => [k, d[k]]));

async function requireFinance(req, ws) {
  const user = await requireUser(req);
  if (user.role !== 'owner' && user.role !== 'admin') throw new HttpError(403, 'Chỉ chủ hệ thống và admin cơ sở xem được tài chính');
  if (!ws || !canAccess(user, ws)) throw new HttpError(403, 'Không có quyền với cơ sở này');
  const { workspaces } = await loadWorkspaces();
  if (!workspaces.some((w) => w.id === ws)) throw new HttpError(404, 'Cơ sở không còn tồn tại');
  return user;
}

const OTA_EVERY = 60 * 60 * 1000;
const KEEP_DAYS = 400; // giữ giá sàn tới ~13 tháng trước (giá đã chốt nằm trong sổ của app)

function cronAllowed(req) {
  const secret = envClean(process.env.CRON_SECRET);
  if (!secret) return false;
  const got = Buffer.from(String(req.headers?.authorization || ''));
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/**
 * Lấy giá Airbnb cho mọi phòng có link Airbnb trong otaListings, gộp vào otaRates của file tài chính:
 * ngày có giá mới thì cập nhật, ngày không còn giá (đã có khách / bị chặn) giữ giá cũ.
 */
async function updateOta(ws, by) {
  const cur = await getJSON(finFile(ws));
  const data = cur?.data?.data || {};
  const rooms = Object.entries(data.otaListings || {}).filter(([, v]) => v?.Airbnb);
  if (!rooms.length) throw new HttpError(400, 'Chưa có link Airbnb nào trong Cài đặt tài chính');
  const ids = {}; const errors = {};
  for (const [roomId, v] of rooms) {
    try { ids[roomId] = await resolveAirbnb(v.Airbnb); } catch (e) { errors[roomId] = e.message; }
  }
  const listings = Object.entries(ids).map(([key, id]) => ({ key, id }));
  let results = {};
  let runError = '';
  try { results = await runAirbnbCalendars(listings); } catch (e) { if (!(e instanceof OtaError)) throw e; runError = e.message; }
  const now = Date.now();
  const cut = new Date(now - KEEP_DAYS * 864e5).toISOString().slice(0, 10);
  const doc = await updateJSON(finFile(ws), (d) => {
    const next = d && d.data ? d : { version: 0, updatedAt: 0, updatedBy: '', data: {} };
    const fd = { ...next.data };
    const otaRates = { ...(fd.otaRates || {}) };
    const roomRuns = {};
    for (const [roomId] of rooms) {
      const r = results[roomId];
      const err = errors[roomId] || runError || r?.error || '';
      roomRuns[roomId] = { id: ids[roomId] || '', ok: !err, error: err, priced: r?.priced || 0, available: r?.available || 0 };
      if (err || !r) continue;
      const old = Object.fromEntries(Object.entries(otaRates[roomId]?.Airbnb || {}).filter(([day]) => day >= cut));
      otaRates[roomId] = { ...(otaRates[roomId] || {}), Airbnb: { ...old, ...r.prices } };
    }
    const ok = Object.values(roomRuns).some((x) => x.ok);
    fd.otaRates = otaRates;
    fd.otaRun = { at: now, by, ok, error: ok ? '' : (runError || Object.values(roomRuns)[0]?.error || 'Không lấy được giá'), rooms: roomRuns };
    return { version: (next.version || 0) + 1, updatedAt: now, updatedBy: by, data: fd };
  }, null);
  return doc;
}

const conflictOf = (cur) => new HttpError(409, 'Dữ liệu trên máy chủ đã thay đổi', {
  version: cur?.data.version || 0, updatedAt: cur?.data.updatedAt || 0, updatedBy: cur?.data.updatedBy || '', data: cur?.data.data || null,
});

export default route(async (req, res) => {
  if (req.method === 'GET' && query(req).get('cron') === 'ota') {
    if (!cronAllowed(req)) throw new HttpError(401, 'Không có quyền');
    const { workspaces } = await loadWorkspaces();
    const done = [];
    for (const w of workspaces) {
      const cur = await getJSON(finFile(w.id));
      if (!Object.values(cur?.data?.data?.otaListings || {}).some((v) => v?.Airbnb)) continue;
      try { await updateOta(w.id, 'Tự cập nhật hằng tháng'); done.push(w.id); } catch (e) { console.error('ota', w.id, e.message); }
    }
    return send(res, 200, { ok: true, workspaces: done.length });
  }

  if (req.method === 'POST') {
    const q = query(req);
    const ws = q.get('ws');
    const user = await requireFinance(req, ws);
    if (q.get('action') !== 'ota') throw new HttpError(400, 'Thao tác không hợp lệ');
    const cur = await getJSON(finFile(ws));
    const last = cur?.data?.data?.otaRun?.at || 0;
    if (Date.now() - last < OTA_EVERY) {
      throw new HttpError(429, `Vừa cập nhật giá lúc ${new Date(last + 7 * 3600e3).toISOString().slice(11, 16)}, thử lại sau ${Math.ceil((OTA_EVERY - (Date.now() - last)) / 60000)} phút`);
    }
    const doc = await updateOta(ws, user.name || user.username);
    return send(res, 200, { version: doc.version, otaRun: doc.data.otaRun });
  }

  if (req.method === 'GET') {
    const ws = query(req).get('ws');
    await requireFinance(req, ws);
    const cur = await getJSON(finFile(ws));
    const doc = cur?.data || { version: 0, updatedAt: 0, updatedBy: '', data: null };
    return send(res, 200, { version: doc.version, updatedAt: doc.updatedAt, updatedBy: doc.updatedBy, data: doc.data });
  }

  if (req.method === 'PUT') {
    const body = await readBody(req);
    const { ws } = body;
    const user = await requireFinance(req, ws);
    if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) throw new HttpError(400, 'Dữ liệu không hợp lệ');
    const data = pick(body.data);
    if (data.expenses !== undefined && !Array.isArray(data.expenses)) throw new HttpError(400, 'Dữ liệu không hợp lệ');
    if (JSON.stringify(data).length > MAX_BYTES) throw new HttpError(413, 'Dữ liệu quá lớn');

    const cur = await getJSON(finFile(ws));
    const curVersion = cur ? cur.data.version : 0;
    if (Number(body.baseVersion || 0) !== curVersion) throw conflictOf(cur);
    const doc = { version: curVersion + 1, updatedAt: Date.now(), updatedBy: user.name || user.username, data };
    try {
      await putJSON(finFile(ws), doc, cur ? { ifMatch: cur.etag } : { create: true });
    } catch (e) {
      if (e instanceof ConflictError) throw conflictOf(await getJSON(finFile(ws)));
      throw e;
    }
    return send(res, 200, { version: doc.version, updatedAt: doc.updatedAt, updatedBy: doc.updatedBy });
  }

  res.setHeader('Allow', 'GET, PUT, POST');
  throw new HttpError(405, 'Method not allowed');
});
