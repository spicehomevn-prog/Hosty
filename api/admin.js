// Quản lý cơ sở & tài khoản — chỉ chủ hệ thống (owner)
// GET  /api/admin                         -> { workspaces, accounts }
// POST /api/admin { action, ... }         (xem các case bên dưới)
import { route, send, readBody, HttpError } from './_http.js';
import { updateJSON, delJSON } from './_store.js';
import {
  requireUser, requireOwner, loadAccounts, loadWorkspaces, publicAccount, hashPassword, randomPassword, validUsername,
  ACCOUNTS, WORKSPACES, wsFile,
} from './_auth.js';
import { createAccount, createWorkspace, RESERVED } from './_accounts.js';
import { TRIAL, PLANS, PAID, COMBOS, comboPrice } from '../src/lib/plan.js';

/** Cộng n tháng (theo lịch, giờ VN) vào mốc ms */
const addMonthsMs = (t, n) => {
  const d = new Date(t + 7 * 3600e3);
  const day = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.getTime() - 7 * 3600e3;
};

export default route(async (req, res) => {
  const user = await requireUser(req);
  requireOwner(user);

  if (req.method === 'GET') {
    const [{ workspaces }, { accounts }] = await Promise.all([loadWorkspaces({ fresh: true }), loadAccounts({ fresh: true })]);
    return send(res, 200, { workspaces, accounts: accounts.map(publicAccount) });
  }
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); throw new HttpError(405, 'Method not allowed'); }

  const b = await readBody(req);
  switch (b.action) {
    case 'create-ws': {
      const name = String(b.name || '').trim();
      if (!name) throw new HttpError(400, 'Vui lòng nhập tên cơ sở');
      const ws = await createWorkspace({ name });
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
    // gói của cơ sở: { id, plan: trial | basic | advanced | premium | vip }
    case 'set-plan': {
      if (!PLANS[b.plan]) throw new HttpError(400, 'Gói không hợp lệ');
      let ws;
      await updateJSON(WORKSPACES, (d) => {
        ws = d.workspaces.find((w) => w.id === b.id);
        if (!ws) throw new HttpError(404, 'Không tìm thấy cơ sở');
        ws.plan = b.plan;
        ws.planAt = Date.now();
        if (b.plan === 'trial' && !ws.trialEnds) ws.trialEnds = Date.now() + TRIAL.days * 864e5;
        // gói trả phí lần đầu: 1 tháng
        if (PAID.includes(b.plan) && !ws.paidUntil) ws.paidUntil = addMonthsMs(Date.now(), 1);
        return d;
      }, { workspaces: [] });
      return send(res, 200, { workspace: ws });
    }
    // gia hạn gói trả phí: { id, months: 1 | 3 | 6 } – cộng từ hạn hiện tại (hoặc từ hôm nay nếu đã hết hạn), ghi lịch sử thanh toán
    case 'extend-paid': {
      const months = Number(b.months);
      if (!COMBOS.some((c) => c.months === months)) throw new HttpError(400, 'Kỳ hạn không hợp lệ');
      let ws;
      await updateJSON(WORKSPACES, (d) => {
        ws = d.workspaces.find((w) => w.id === b.id);
        if (!ws) throw new HttpError(404, 'Không tìm thấy cơ sở');
        const plan = PAID.includes(ws.plan) ? ws.plan : PAID.includes(b.plan) ? b.plan : null;
        if (!plan) throw new HttpError(400, 'Chọn gói Cơ bản / Nâng cao / Cao cấp trước khi gia hạn');
        ws.plan = plan;
        ws.paidUntil = addMonthsMs(Math.max(Date.now(), ws.paidUntil || 0), months);
        ws.payments = [{ at: Date.now(), plan, months, amount: comboPrice(plan, months) }, ...(ws.payments || [])].slice(0, 24);
        return d;
      }, { workspaces: [] });
      return send(res, 200, { workspace: ws });
    }
    case 'extend-trial': {
      const days = Math.min(90, Math.max(1, Number(b.days) || TRIAL.days));
      let ws;
      await updateJSON(WORKSPACES, (d) => {
        ws = d.workspaces.find((w) => w.id === b.id);
        if (!ws) throw new HttpError(404, 'Không tìm thấy cơ sở');
        ws.plan = 'trial';
        ws.trialEnds = Math.max(Date.now(), ws.trialEnds || 0) + days * 864e5;
        return d;
      }, { workspaces: [] });
      return send(res, 200, { workspace: ws });
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
