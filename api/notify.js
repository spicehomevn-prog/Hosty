// Nhắc hẹn task bằng thông báo đẩy.
// GET  /api/notify?ws=ID                         -> { push: { publicKey, devices, cron } }
// POST /api/notify { action, ws, ... }           action: push-sub | push-unsub | push-test
// GET  /api/notify?cron=push  (Authorization: Bearer CRON_SECRET) – gọi 5 phút/lần từ dịch vụ hẹn giờ ngoài (cron-job.org…)
import { timingSafeEqual } from 'node:crypto';
import { route, send, readBody, query, HttpError } from './_http.js';
import { requireUser, canAccess, loadWorkspaces, envClean } from './_auth.js';
import {
  vapidKeys, pushSubscribe, pushUnsubscribe, pushInfo, pushSend, pushDue,
} from './_notify.js';

/** Kiểm tra cron ngoài (cron-job.org…): nhận "Bearer <CRON_SECRET>" hoặc chỉ "<CRON_SECRET>", bỏ khoảng trắng / dấu < > thừa.
 *  Trả '' nếu hợp lệ, hoặc lý do bị từ chối (không bao giờ chứa giá trị bí mật). */
function cronProblem(req) {
  const secret = envClean(process.env.CRON_SECRET);
  if (!secret) return 'Máy chủ chưa có biến CRON_SECRET (thêm trên Vercel rồi Redeploy)';
  if (secret.length < 16) return 'CRON_SECRET trên Vercel quá ngắn (cần ít nhất 16 ký tự)';
  const raw = String(req.headers?.authorization || '').trim();
  if (!raw) return 'Thiếu header Authorization (cron-job.org: Advanced → Headers)';
  const got = Buffer.from(raw.replace(/^bearer\s+/i, '').trim().replace(/^<(.*)>$/, '$1'));
  const want = Buffer.from(secret);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return 'Header Authorization không khớp CRON_SECRET (giá trị đúng: Bearer + dấu cách + CRON_SECRET)';
  return '';
}

async function requireWs(req, ws) {
  const user = await requireUser(req);
  if (!ws || !canAccess(user, ws)) throw new HttpError(403, 'Không có quyền với cơ sở này');
  const { workspaces } = await loadWorkspaces();
  if (!workspaces.some((w) => w.id === ws)) throw new HttpError(404, 'Cơ sở không còn tồn tại');
  return user;
}

export default route(async (req, res) => {
  const q = query(req);

  if (req.method === 'GET' && q.get('cron') === 'push') {
    const why = cronProblem(req);
    if (why) throw new HttpError(401, why);
    return send(res, 200, { ok: true, ...(await pushDue()) });
  }

  if (req.method === 'GET') {
    const ws = q.get('ws');
    const user = await requireWs(req, ws);
    const [push, v] = await Promise.all([pushInfo(user.id, ws), vapidKeys()]);
    return send(res, 200, { push: { ...push, publicKey: v.publicKey } });
  }

  if (req.method === 'POST') {
    const body = await readBody(req);
    const { action, ws } = body;
    const user = await requireWs(req, ws);
    switch (action) {
      case 'push-sub': return send(res, 200, { devices: await pushSubscribe(user.id, ws, body.sub, req.headers?.['user-agent']) });
      case 'push-unsub': await pushUnsubscribe(user.id, String(body.endpoint || '')); return send(res, 200, { ok: true });
      case 'push-test': {
        const r = await pushSend(user.id, ws, { title: '🔔 Hostexa', body: 'Thông báo thử: máy này sẽ nhận lời nhắc task.', tag: 'test', url: '/?tab=tasks' });
        if (!r.sent) throw new HttpError(400, 'Không gửi được tới máy nào. Bật lại thông báo trên máy này.');
        return send(res, 200, r);
      }
      default: throw new HttpError(400, 'Thao tác không hợp lệ');
    }
  }

  res.setHeader('Allow', 'GET, POST');
  throw new HttpError(405, 'Method not allowed');
});
