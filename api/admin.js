// Quản lý cơ sở & tài khoản — chỉ chủ hệ thống (owner)
// GET  /api/admin                         -> { workspaces, accounts }
// POST /api/admin { action, ... }         (xem các case bên dưới)
import { randomBytes } from 'node:crypto';
import { route, send, readBody, HttpError } from './_http.js';
import { updateJSON, delJSON } from './_store.js';
import {
  requireUser, requireOwner, loadAccounts, loadWorkspaces, publicAccount, hashPassword, randomPassword,
  slugify, validUsername, ACCOUNTS, WORKSPACES, wsFile, envClean,
} from './_auth.js';

const newId = () => randomBytes(6).toString('hex');
const RESERVED = () => envClean(process.env.HOSTY_OWNER_USERNAME).toLowerCase();

function nextUsername(accounts, base) {
  const taken = new Set(accounts.map((a) => a.username));
  if (!taken.has(base) && base !== RESERVED()) return base;
  for (let i = 2; i < 1000; i++) if (!taken.has(`${base}${i}`)) return `${base}${i}`;
  return `${base}${Date.now()}`;
}

async function createAccount({ ws, role, name, username }) {
  const { workspaces } = await loadWorkspaces();
  const w = workspaces.find((x) => x.id === ws);
  if (!w) throw new HttpError(404, 'Không tìm thấy cơ sở');
  if (!['admin', 'member'].includes(role)) throw new HttpError(400, 'Vai trò không hợp lệ');
  const password = randomPassword();
  const h = await hashPassword(password);
  let created;
  await updateJSON(ACCOUNTS, (d) => {
    let u = String(username || '').trim().toLowerCase();
    if (u) {
      if (!validUsername(u)) throw new HttpError(400, 'Tên đăng nhập chỉ gồm chữ thường không dấu, số, dấu - _ . (3–40 ký tự)');
      if (d.accounts.some((a) => a.username === u) || u === RESERVED()) throw new HttpError(409, 'Tên đăng nhập đã được dùng');
    } else {
      u = nextUsername(d.accounts, `${w.slug}-${role}`);
    }
    created = {
      id: newId(), username: u, name: String(name || '').trim() || (role === 'admin' ? `Admin ${w.name}` : 'Nhân viên dọn phòng'),
      role, ws, ...h, tokenVersion: 0, disabled: false, createdAt: Date.now(),
    };
    d.accounts.push(created);
    return d;
  }, { accounts: [] });
  return { account: publicAccount(created), password };
}

export default route(async (req, res) => {
  const user = await requireUser(req);
  requireOwner(user);

  if (req.method === 'GET') {
    const [{ workspaces }, { accounts }] = await Promise.all([loadWorkspaces(), loadAccounts()]);
    return send(res, 200, { workspaces, accounts: accounts.map(publicAccount) });
  }
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); throw new HttpError(405, 'Method not allowed'); }

  const b = await readBody(req);
  switch (b.action) {
    case 'create-ws': {
      const name = String(b.name || '').trim();
      if (!name) throw new HttpError(400, 'Vui lòng nhập tên cơ sở');
      let ws;
      await updateJSON(WORKSPACES, (d) => {
        const base = slugify(name);
        const used = new Set(d.workspaces.map((w) => w.slug));
        let slug = base;
        for (let i = 2; used.has(slug); i++) slug = `${base}${i}`;
        ws = { id: newId(), name, slug, createdAt: Date.now() };
        d.workspaces.push(ws);
        return d;
      }, { workspaces: [] });
      const admin = await createAccount({ ws: ws.id, role: 'admin' });
      return send(res, 200, { workspace: ws, ...admin });
    }
    case 'rename-ws': {
      const name = String(b.name || '').trim();
      if (!name) throw new HttpError(400, 'Vui lòng nhập tên cơ sở');
      let ws;
      await updateJSON(WORKSPACES, (d) => {
        ws = d.workspaces.find((w) => w.id === b.id);
        if (!ws) throw new HttpError(404, 'Không tìm thấy cơ sở');
        ws.name = name;
        return d;
      }, { workspaces: [] });
      return send(res, 200, { workspace: ws });
    }
    case 'delete-ws': {
      await updateJSON(WORKSPACES, (d) => ({ ...d, workspaces: d.workspaces.filter((w) => w.id !== b.id) }), { workspaces: [] });
      await updateJSON(ACCOUNTS, (d) => ({ ...d, accounts: d.accounts.filter((a) => a.ws !== b.id) }), { accounts: [] });
      await delJSON(wsFile(b.id));
      await delJSON(`fin/${b.id}.json`);
      return send(res, 200, { ok: true });
    }
    case 'add-account': {
      const r = await createAccount({ ws: b.ws, role: b.role || 'member', name: b.name, username: b.username });
      return send(res, 200, r);
    }
    case 'update-account': {
      let acc;
      await updateJSON(ACCOUNTS, (d) => {
        acc = d.accounts.find((a) => a.id === b.id);
        if (!acc) throw new HttpError(404, 'Không tìm thấy tài khoản');
        if (b.name !== undefined) acc.name = String(b.name).trim() || acc.name;
        if (b.username !== undefined) {
          const u = String(b.username).trim().toLowerCase();
          if (u !== acc.username) {
            if (!validUsername(u)) throw new HttpError(400, 'Tên đăng nhập chỉ gồm chữ thường không dấu, số, dấu - _ . (3–40 ký tự)');
            if (d.accounts.some((a) => a.username === u) || u === RESERVED()) throw new HttpError(409, 'Tên đăng nhập đã được dùng');
            acc.username = u;
          }
        }
        if (b.role !== undefined && ['admin', 'member'].includes(b.role) && b.role !== acc.role) {
          acc.role = b.role;
          acc.tokenVersion = (acc.tokenVersion || 0) + 1;
        }
        if (b.disabled !== undefined && !!b.disabled !== !!acc.disabled) {
          acc.disabled = !!b.disabled;
          acc.tokenVersion = (acc.tokenVersion || 0) + 1;
        }
        return d;
      }, { accounts: [] });
      return send(res, 200, { account: publicAccount(acc) });
    }
    case 'reset-password': {
      const password = randomPassword();
      const h = await hashPassword(password);
      let acc;
      await updateJSON(ACCOUNTS, (d) => {
        acc = d.accounts.find((a) => a.id === b.id);
        if (!acc) throw new HttpError(404, 'Không tìm thấy tài khoản');
        Object.assign(acc, h);
        acc.tokenVersion = (acc.tokenVersion || 0) + 1;
        return d;
      }, { accounts: [] });
      return send(res, 200, { account: publicAccount(acc), password });
    }
    case 'delete-account': {
      await updateJSON(ACCOUNTS, (d) => ({ ...d, accounts: d.accounts.filter((a) => a.id !== b.id) }), { accounts: [] });
      return send(res, 200, { ok: true });
    }
    default:
      throw new HttpError(400, 'Thao tác không hợp lệ');
  }
});
