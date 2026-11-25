// POST /api/auth {action:'login', username, password}         -> { token, user, workspaces }
// POST /api/auth {action:'change-password', oldPassword, newPassword} -> { token }
// GET  /api/auth                                               -> { user, workspaces }
// GET  /api/auth?members=1&ws=ID                               -> { members: [{id, name, username, role}] }
// POST /api/auth {action:'signup', wsName, name, phone, password, consent:true, policyVersion}  -> { token, user, workspaces }   (đăng ký dùng thử, không cần đăng nhập)
// POST /api/auth {action:'delete-account', password, dry?}  -> xoá tài khoản của chính mình; admin duy nhất của cơ sở thì xoá cả cơ sở + dữ liệu
// POST /api/auth {action:'add-member', ws, name} / {action:'remove-member', ws, id}  (admin cơ sở dùng thử, tối đa 1 member)
import { createHash } from 'node:crypto';
import { route, send, readBody, query, HttpError } from './_http.js';
import { updateJSON } from './_store.js';
import {
  login, requireUser, workspacesFor, canAccess, loadAccounts, loadWorkspaces, hashPassword, checkPassword, ACCOUNTS, envClean,
} from './_auth.js';
import { createAccount, createWorkspace } from './_accounts.js';
import { cleanLocations } from './_scope.js';
import { TRIAL, isTrial, planExpired, planOf, normPhone } from '../src/lib/plan.js';
import { POLICY_VERSION } from '../src/lib/legal.js';
import { deleteAccount } from './_delete.js';

const SIGNUPS = 'signups.json';
const MAX_PER_IP_DAY = 3;
const MAX_TRIALS = 200;
// Vercel tự đặt x-real-ip / x-vercel-forwarded-for bằng IP thật của khách (ghi đè giá trị khách tự gửi)
const ipOf = (req) => String(req.headers?.['x-real-ip'] || req.headers?.['x-vercel-forwarded-for'] || req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
const ipHash = (ip) => createHash('sha256').update(`hostexa-signup:${envClean(process.env.AUTH_SECRET)}:${ip}`).digest('hex').slice(0, 16);

/** Đăng ký dùng thử: tạo cơ sở gói trial (14 ngày) + tài khoản admin đăng nhập bằng SĐT */
async function signup(req, b) {
  const wsName = String(b.wsName || '').trim().slice(0, 60);
  const name = String(b.name || '').trim().slice(0, 60);
  const phone = normPhone(b.phone);
  const password = String(b.password || '');
  if (!wsName) throw new HttpError(400, 'Vui lòng nhập tên cơ sở');
  if (!name) throw new HttpError(400, 'Vui lòng nhập họ tên');
  if (!phone) throw new HttpError(400, 'Số điện thoại không hợp lệ');
  if (password.length < 6) throw new HttpError(400, 'Mật khẩu cần ít nhất 6 ký tự');
  // đồng ý Điều khoản + Chính sách bảo mật: bắt buộc, không tích sẵn (Luật 91/2025 Điều 9, NĐ 356/2025 Điều 6)
  if (b.consent !== true) throw new HttpError(400, 'Vui lòng đọc và đồng ý Điều khoản sử dụng và Chính sách bảo mật để tạo tài khoản');
  if (b.policyVersion !== POLICY_VERSION) throw new HttpError(409, 'Điều khoản vừa được cập nhật. Vui lòng tải lại trang rồi đăng ký lại.');
  const { accounts } = await loadAccounts({ fresh: true });
  if (accounts.some((a) => a.username === phone)) throw new HttpError(409, 'Số điện thoại này đã có tài khoản – hãy đăng nhập');
  const { workspaces } = await loadWorkspaces({ fresh: true });
  if (workspaces.filter(isTrial).length >= MAX_TRIALS) throw new HttpError(503, 'Đã đủ số tài khoản dùng thử, vui lòng liên hệ để được hỗ trợ');
  // chống spam: tối đa 3 lần đăng ký / IP / ngày (lưu dạng băm, không lưu IP thật)
  const h = ipHash(ipOf(req));
  const now = Date.now();
  await updateJSON(SIGNUPS, (d) => {
    const list = (d?.list || []).filter((x) => now - x.at < 90 * 864e5);
    if (list.filter((x) => x.ip === h && now - x.at < 864e5).length >= MAX_PER_IP_DAY) throw new HttpError(429, 'Bạn đã đăng ký quá nhiều lần hôm nay, thử lại sau');
    list.push({ at: now, ip: h, phone });
    return { list };
  }, { list: [] });
  const ws = await createWorkspace({ name: wsName, extra: { plan: 'trial', trialEnds: now + TRIAL.days * 864e5, contact: { name, phone }, signupAt: now } });
  await createAccount({ ws: ws.id, role: 'admin', name, username: phone, password, extra: { consent: { at: now, version: POLICY_VERSION, terms: true, privacy: true } } });
  const r = await login(phone, password);
  return { token: r.token, user: r.user, workspaces: await workspacesFor(r.user, { fresh: true }) };
}

/** Admin cơ sở tự quản lý nhân viên dọn phòng (tối đa theo gói: dùng thử 1, Cơ bản 2, Nâng cao 5, Cao cấp 10, VIP không giới hạn) */
async function planAdmin(req, b) {
  const user = await requireUser(req);
  if ((user.role !== 'admin' && user.role !== 'owner') || !canAccess(user, b.ws)) throw new HttpError(403, 'Chỉ admin cơ sở được thực hiện');
  const ws = (await loadWorkspaces({ fresh: true })).workspaces.find((w) => w.id === b.ws);
  if (!ws) throw new HttpError(404, 'Không tìm thấy cơ sở');
  const plan = planOf(ws);
  const owner = user.role === 'owner'; // chủ hệ thống: không giới hạn theo gói
  if (!owner && planExpired(ws)) throw new HttpError(403, `Gói ${plan.name} đã hết hạn – gia hạn để tiếp tục`);
  const { accounts } = await loadAccounts({ fresh: true });
  const members = accounts.filter((a) => a.ws === ws.id && a.role === 'member');
  if (b.action === 'add-member') {
    if (!owner && members.length >= plan.maxMembers) throw new HttpError(400, `Gói ${plan.name} tối đa ${plan.maxMembers} nhân viên – nâng cấp gói để thêm`, { pro: true });
    return createAccount({ ws: ws.id, role: 'member', kind: b.kind, name: String(b.name || '').trim().slice(0, 60) });
  }
  if (b.action === 'set-kind') {
    if (!members.some((a) => a.id === b.id)) throw new HttpError(404, 'Không tìm thấy nhân viên');
    if (!['cleaner', 'staff'].includes(b.kind)) throw new HttpError(400, 'Loại tài khoản không hợp lệ');
    await updateJSON(ACCOUNTS, (d) => ({ ...d, accounts: d.accounts.map((a) => (a.id === b.id ? { ...a, kind: b.kind } : a)) }), { accounts: [] });
    return { ok: true, kind: b.kind };
  }
  if (b.action === 'set-locations') {
    if (!members.some((a) => a.id === b.id)) throw new HttpError(404, 'Không tìm thấy nhân viên');
    const locations = await cleanLocations(ws.id, b.locations);
    await updateJSON(ACCOUNTS, (d) => ({ ...d, accounts: d.accounts.map((a) => (a.id === b.id ? { ...a, locations } : a)) }), { accounts: [] });
    return { ok: true, locations };
  }
  if (b.action !== 'remove-member') throw new HttpError(400, 'Thao tác không hợp lệ');
  if (!members.some((a) => a.id === b.id)) throw new HttpError(404, 'Không tìm thấy nhân viên');
  await updateJSON(ACCOUNTS, (d) => ({ ...d, accounts: d.accounts.filter((a) => a.id !== b.id) }), { accounts: [] });
  return { ok: true };
}

export default route(async (req, res) => {
  if (req.method === 'GET') {
    const user = await requireUser(req);
    const q = query(req);
    if (q.get('members')) {
      const ws = q.get('ws');
      if (!canAccess(user, ws)) throw new HttpError(403, 'Không có quyền với cơ sở này');
      const { accounts } = await loadAccounts();
      const members = accounts.filter((a) => a.ws === ws && !a.disabled)
        .map((a) => ({ id: a.id, name: a.name, username: a.username, role: a.role, kind: a.kind === 'staff' ? 'staff' : 'cleaner', locations: Array.isArray(a.locations) ? a.locations : [] }));
      return send(res, 200, { members });
    }
    // đọc bản mới nhất: gói của cơ sở vừa được chủ hệ thống đổi phải hiện ngay (1 thao tác Blob mỗi lần mở app)
    return send(res, 200, { user, workspaces: await workspacesFor(user, { fresh: true }) });
  }

  if (req.method === 'POST') {
    const body = await readBody(req);
    if (body.action === 'signup') return send(res, 200, await signup(req, body));
    if (body.action === 'add-member' || body.action === 'remove-member' || body.action === 'set-kind' || body.action === 'set-locations') return send(res, 200, await planAdmin(req, body));
    if (body.action === 'login') {
      const { token, user } = await login(body.username, body.password);
      return send(res, 200, { token, user, workspaces: await workspacesFor(user, { fresh: true }) });
    }
    if (body.action === 'delete-account') {
      const user = await requireUser(req);
      if (user.role === 'owner') throw new HttpError(400, 'Tài khoản chủ hệ thống khai báo trong biến môi trường, không xoá ở đây');
      // xác nhận bằng mật khẩu (dùng lại login: có khoá khi sai nhiều lần)
      if (!body.dry) {
        try { await login(user.username, String(body.password || '')); } catch (e) {
          if (e.status === 401) throw new HttpError(400, 'Mật khẩu không đúng'); // không dùng 401: app sẽ tự đăng xuất
          throw e;
        }
      }
      return send(res, 200, await deleteAccount(user, { dry: !!body.dry }));
    }
    if (body.action === 'change-password') {
      const user = await requireUser(req);
      if (user.role === 'owner') throw new HttpError(400, 'Mật khẩu chủ hệ thống đổi trong biến môi trường HOSTY_OWNER_PASSWORD trên Vercel');
      const np = String(body.newPassword || '');
      if (np.length < 6) throw new HttpError(400, 'Mật khẩu mới cần ít nhất 6 ký tự');
      const { accounts } = await loadAccounts({ fresh: true });
      const acc = accounts.find((a) => a.id === user.id);
      if (!acc || !(await checkPassword(String(body.oldPassword || ''), acc.salt, acc.passHash))) {
        throw new HttpError(400, 'Mật khẩu hiện tại không đúng');
      }
      const h = await hashPassword(np);
      await updateJSON(ACCOUNTS, (d) => {
        const a = d.accounts.find((x) => x.id === user.id);
        if (a) { Object.assign(a, h); a.tokenVersion = (a.tokenVersion || 0) + 1; }
        return d;
      }, { accounts: [] });
      const { token } = await login(user.username, np);
      return send(res, 200, { token });
    }
    throw new HttpError(400, 'Thao tác không hợp lệ');
  }
  res.setHeader('Allow', 'GET, POST');
  throw new HttpError(405, 'Method not allowed');
});
