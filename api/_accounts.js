// Tạo cơ sở / tài khoản (dùng chung cho chủ hệ thống và đăng ký dùng thử)
import { randomBytes } from 'node:crypto';
import { HttpError } from './_http.js';
import { updateJSON } from './_store.js';
import { loadWorkspaces, publicAccount, hashPassword, randomPassword, slugify, validUsername, ACCOUNTS, WORKSPACES, envClean } from './_auth.js';

const newId = () => randomBytes(6).toString('hex');
export const RESERVED = () => envClean(process.env.HOSTY_OWNER_USERNAME).toLowerCase();

function nextUsername(accounts, base) {
  const taken = new Set(accounts.map((a) => a.username));
  if (!taken.has(base) && base !== RESERVED()) return base;
  for (let i = 2; i < 1000; i++) if (!taken.has(`${base}${i}`)) return `${base}${i}`;
  return `${base}${Date.now()}`;
}

export async function createAccount({ ws, role, name, username, password: pw, extra = {} }) {
  const { workspaces } = await loadWorkspaces({ fresh: true });
  const w = workspaces.find((x) => x.id === ws);
  if (!w) throw new HttpError(404, 'Không tìm thấy cơ sở');
  if (!['admin', 'member'].includes(role)) throw new HttpError(400, 'Vai trò không hợp lệ');
  const password = pw || randomPassword();
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
      role, ws, ...h, tokenVersion: 0, disabled: false, createdAt: Date.now(), ...extra,
    };
    d.accounts.push(created);
    return d;
  }, { accounts: [] });
  return { account: publicAccount(created), password };
}

/** Tạo cơ sở mới (slug không trùng). extra: { plan, trialEnds, contact… } */
export async function createWorkspace({ name, extra = {} }) {
  let ws;
  await updateJSON(WORKSPACES, (d) => {
    const base = slugify(name);
    const used = new Set(d.workspaces.map((w) => w.slug));
    let slug = base;
    for (let i = 2; used.has(slug); i++) slug = `${base}${i}`;
    ws = { id: newId(), name, slug, createdAt: Date.now(), ...extra };
    d.workspaces.push(ws);
    return d;
  }, { workspaces: [] });
  return ws;
}
