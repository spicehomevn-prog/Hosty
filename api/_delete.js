// Xoá tài khoản (người dùng tự xoá) và dữ liệu đi kèm.
// - Admin duy nhất của cơ sở: xoá TOÀN BỘ cơ sở: ws/<id>.json, fin/<id>.json, đệm lịch sàn, mọi tài khoản của cơ sở,
//   thiết bị nhận thông báo, SĐT trong sổ chống spam đăng ký. Không khôi phục được.
// - Admin còn có admin khác, hoặc nhân viên / dọn phòng: chỉ xoá tài khoản của chính họ (và thiết bị nhận thông báo).
// Thứ tự: dữ liệu trước, bản ghi cơ sở, tài khoản SAU CÙNG để lỗi giữa chừng vẫn đăng nhập và thử lại được.
import { getJSON, delJSON, updateJSON } from './_store.js';
import { ACCOUNTS, WORKSPACES, wsFile, loadAccounts } from './_auth.js';
import { purgeUserPush } from './_notify.js';

const finFile = (ws) => `fin/${ws}.json`; // trùng với api/finance.js
const SIGNUPS = 'signups.json';

async function scrubSignups(phones) {
  const set = new Set(phones.filter(Boolean));
  if (!set.size) return;
  await updateJSON(SIGNUPS, (d) => ({ ...(d || {}), list: (d?.list || []).map((x) => (set.has(x.phone) ? { at: x.at, ip: x.ip } : x)) }), { list: [] });
}

/** user: người đang đăng nhập (admin/member). dry: chỉ cho biết sẽ xoá gì. */
export async function deleteAccount(user, { dry = false } = {}) {
  const { accounts } = await loadAccounts({ fresh: true });
  const me = accounts.find((a) => a.id === user.id);
  if (!me) return { ok: true, scope: 'self', already: true };
  const mine = accounts.filter((a) => a.ws === me.ws);
  const otherAdmin = mine.some((a) => a.role === 'admin' && a.id !== me.id && !a.disabled);
  const wholeWs = me.role === 'admin' && !otherAdmin;
  if (dry) return { ok: true, dry: true, scope: wholeWs ? 'workspace' : 'self', accounts: wholeWs ? mine.length : 1, members: mine.filter((a) => a.role === 'member').length };

  const gone = wholeWs ? mine : [me];
  if (wholeWs) {
    const data = (await getJSON(wsFile(me.ws), { etag: false }))?.data?.data; // file ws = { version, data }
    await Promise.all((data?.calendars || []).map((c) => delJSON(`feedcache/${c.id}.json`)));
    await delJSON(wsFile(me.ws));
    await delJSON(finFile(me.ws));
    await updateJSON(WORKSPACES, (d) => ({ ...d, workspaces: (d?.workspaces || []).filter((w) => w.id !== me.ws) }), { workspaces: [] });
  }
  await Promise.all(gone.map((a) => purgeUserPush(a.id).catch(() => {})));
  await scrubSignups(gone.map((a) => a.username));
  const ids = new Set(gone.map((a) => a.id));
  await updateJSON(ACCOUNTS, (d) => ({ ...d, accounts: d.accounts.filter((a) => !ids.has(a.id)) }), { accounts: [] });
  return { ok: true, scope: wholeWs ? 'workspace' : 'self', accounts: gone.length };
}
