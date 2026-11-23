// Tài chính của từng cơ sở — CHỈ chủ hệ thống (owner) và admin cơ sở. Tài khoản dọn phòng luôn bị từ chối.
// Dữ liệu tách riêng khỏi ws/<id>.json (mà member tải về) để member không bao giờ nhận được số liệu tiền.
// GET /api/finance?ws=ID                    -> { version, updatedAt, updatedBy, data }
// PUT /api/finance { ws, baseVersion, data } -> { version, updatedAt }   (409 nếu bản trên máy chủ đã đổi)
import { route, send, readBody, query, HttpError, MAX_BYTES } from './_http.js';
import { getJSON, putJSON, ConflictError } from './_store.js';
import { requireUser, canAccess, loadWorkspaces } from './_auth.js';

export const FIN_KEYS = ['settings', 'rateTable', 'dayDiscount', 'stayDiscount', 'prices', 'expenses', 'history', 'roomMap'];
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

const conflictOf = (cur) => new HttpError(409, 'Dữ liệu trên máy chủ đã thay đổi', {
  version: cur?.data.version || 0, updatedAt: cur?.data.updatedAt || 0, updatedBy: cur?.data.updatedBy || '', data: cur?.data.data || null,
});

export default route(async (req, res) => {
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

  res.setHeader('Allow', 'GET, PUT');
  throw new HttpError(405, 'Method not allowed');
});
