// Nhắc hẹn task bằng thông báo đẩy.
// GET  /api/notify?ws=ID                         -> { push: { publicKey, devices, cron } }
// POST /api/notify { action, ws, ... }           action: push-sub | push-unsub | push-test | push-prefs
// GET  /api/notify?cron=push  (Authorization: Bearer CRON_SECRET) – gọi 5 phút/lần từ dịch vụ hẹn giờ ngoài (cron-job.org…)
import { timingSafeEqual } from 'node:crypto';
import { route, send, readBody, query, HttpError } from './_http.js';
import { requireUser, canAccess, envClean, wsExists, requirePro } from './_auth.js';
import {
  vapidKeys, pushSubscribe, pushUnsubscribe, pushInfo, pushSend, pushDue, pushSetPrefs, stayDue, dailyNow, saveRun, loadRun, cronCtx,
} from './_notify.js';

const dailyTry = new Map(); // giới hạn nút "Gửi tổng quan ngay" (theo phiên máy chủ)

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
  if (!(await wsExists(ws))) throw new HttpError(404, 'Cơ sở không còn tồn tại');
  return user;
}

export default route(async (req, res) => {
  const q = query(req);

  if (req.method === 'GET' && q.get('cron') === 'push') {
    const why = cronProblem(req);
    if (why) throw new HttpError(401, why);
    const at = Date.now();
    const errors = [];
    let tasks = { sent: 0 }; let stays = { sent: 0, daily: {} };
    // chạy riêng từng phần: phần này lỗi không làm mất phần kia; lỗi được ghi lại thay vì nuốt im lặng
    const ctx = cronCtx(); // mỗi file đọc tối đa 1 lần trong lượt này
    try { tasks = await pushDue(at, ctx); } catch (e) { console.error('pushDue', e); errors.push(`Nhắc task: ${String(e.message).slice(0, 120)}`); }
    try { stays = await stayDue(at, { ctx }); } catch (e) { console.error('stayDue', e); errors.push(`Tổng quan / nhận–trả phòng: ${String(e.message).slice(0, 120)}`); }
    errors.push(...(stays.errors || []));
    const sent = (tasks.sent || 0) + (stays.sent || 0);
    // chỉ ghi nhật ký khi lượt này có việc (gửi / lỗi / trạng thái tổng quan) – tránh đọc-ghi Blob mỗi 5 phút
    const notices = (tasks.reminders || 0) + (stays.notices || 0);
    if (sent || notices || errors.length || Object.keys(stays.daily || {}).length) {
      await saveRun({ at, sent, notices, errors: errors.slice(0, 5) }, stays.daily || {});
    }
    return send(res, 200, { ok: !errors.length, sent, tasks: { sent: tasks.sent || 0, reminders: tasks.reminders || 0 }, stays: { sent: stays.sent || 0, notices: stays.notices || 0, daily: stays.daily || {} }, errors });
  }

  if (req.method === 'GET') {
    const ws = q.get('ws');
    const user = await requireWs(req, ws);
    const [push, v, run] = await Promise.all([pushInfo(user.id, ws), vapidKeys(), user.role === 'member' ? null : loadRun()]);
    // tóm tắt lượt chạy cho chủ hệ thống / admin: tổng quan hôm nay + lỗi gần nhất
    let runInfo = null;
    if (run) {
      const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
      const lastErr = (run.runs || []).find((r) => r.errors?.length);
      runInfo = { at: run.at || 0, daily: run.daily?.[`${ws}|${today}`] || null, lastError: lastErr ? { at: lastErr.at, text: lastErr.errors[0] } : null };
    }
    return send(res, 200, { push: { ...push, publicKey: v.publicKey }, run: runInfo });
  }

  if (req.method === 'POST') {
    const body = await readBody(req);
    const { action, ws } = body;
    const user = await requireWs(req, ws);
    if (String(action).startsWith('push-')) await requirePro(ws, 'Thông báo đẩy');
    switch (action) {
      case 'push-sub': return send(res, 200, { devices: await pushSubscribe(user.id, ws, body.sub, req.headers?.['user-agent']) });
      case 'push-prefs': return send(res, 200, { prefs: await pushSetPrefs(user.id, body.prefs) });
      case 'push-daily-now': {
        const last = dailyTry.get(user.id) || 0;
        if (Date.now() - last < 60000) throw new HttpError(429, 'Vừa gửi xong, thử lại sau 1 phút');
        dailyTry.set(user.id, Date.now());
        return send(res, 200, await dailyNow(user, ws));
      }
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
