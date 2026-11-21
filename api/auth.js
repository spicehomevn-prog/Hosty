// POST /api/auth {action:'login', username, password}         -> { token, user, workspaces }
// POST /api/auth {action:'change-password', oldPassword, newPassword} -> { token }
// GET  /api/auth                                               -> { user, workspaces }
// GET  /api/auth?members=1&ws=ID                               -> { members: [{id, name, username, role}] }
import { route, send, readBody, query, HttpError } from './_http.js';
import { updateJSON } from './_store.js';
import {
  login, requireUser, workspacesFor, canAccess, loadAccounts, hashPassword, checkPassword, ACCOUNTS,
} from './_auth.js';

export default route(async (req, res) => {
  if (req.method === 'GET') {
    const user = await requireUser(req);
    const q = query(req);
    if (q.get('members')) {
      const ws = q.get('ws');
      if (!canAccess(user, ws)) throw new HttpError(403, 'Không có quyền với cơ sở này');
      const { accounts } = await loadAccounts();
      const members = accounts.filter((a) => a.ws === ws && !a.disabled)
        .map((a) => ({ id: a.id, name: a.name, username: a.username, role: a.role }));
      return send(res, 200, { members });
    }
    return send(res, 200, { user, workspaces: await workspacesFor(user) });
  }

  if (req.method === 'POST') {
    const body = await readBody(req);
    if (body.action === 'login') {
      const { token, user } = await login(body.username, body.password);
      return send(res, 200, { token, user, workspaces: await workspacesFor(user) });
    }
    if (body.action === 'change-password') {
      const user = await requireUser(req);
      if (user.role === 'owner') throw new HttpError(400, 'Mật khẩu chủ hệ thống đổi trong biến môi trường HOSTY_OWNER_PASSWORD trên Vercel');
      const np = String(body.newPassword || '');
      if (np.length < 6) throw new HttpError(400, 'Mật khẩu mới cần ít nhất 6 ký tự');
      const { accounts } = await loadAccounts();
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
