// Nhắc hẹn task bằng thông báo đẩy (Web Push) tới các máy đã bật.
// Ai nhận: task giao cho ai -> người đó; task "Chung" -> mọi người của cơ sở đã bật thông báo.
// File trên Blob (bí mật được mã hoá bằng khoá suy ra từ AUTH_SECRET):
//   notify/index.json        { push: { [uid]: [ws] } }   – ai nhận nhắc của cơ sở nào
//   notify/push/<uid>.json   { subs: [{ endpoint, keys, ws, ua, at }] }
//   notify/vapid.json        { publicKey, privateKey(enc) }   – tự tạo lần đầu nếu không có biến VAPID_*
//   notify/sent.json         { [khoá lần nhắc]: thời điểm gửi }   – chống gửi trùng
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { getJSON, putJSON, updateJSON, ConflictError } from './_store.js';
import { envClean, loadAccounts, wsFile } from './_auth.js';
import { HttpError } from './_http.js';
import { taskInstances, REMINDS } from '../src/lib/tasks.js';
import { addDays } from '../src/lib/dates.js';

const INDEX = 'notify/index.json';
const pFile = (uid) => `notify/push/${uid}.json`;
const SENT = 'notify/sent.json';
const VAPID = 'notify/vapid.json';

/* ---------- Mã hoá bí mật lưu trên Blob ---------- */
const key = () => createHash('sha256').update(`hostexa-notify:${envClean(process.env.AUTH_SECRET)}`).digest();
export function enc(text) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64url');
}
export function dec(s) {
  try {
    const b = Buffer.from(String(s || ''), 'base64url');
    const d = createDecipheriv('aes-256-gcm', key(), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
  } catch { return ''; }
}

/* ---------- Danh sách người nhận ---------- */
export async function loadIndex() { return (await getJSON(INDEX))?.data || { push: {} }; }
async function setIndex(kind, uid, wsList) {
  await updateJSON(INDEX, (d) => {
    const next = { push: {}, ...(d || {}) };
    next[kind] = { ...(next[kind] || {}) };
    if (wsList?.length) next[kind][uid] = [...new Set(wsList)]; else delete next[kind][uid];
    return next;
  }, { push: {} });
}

/** Người dùng còn hợp lệ với cơ sở không (tài khoản bị xoá / khoá / chuyển cơ sở thì bỏ) */
async function validUsers() {
  const { accounts } = await loadAccounts();
  const m = new Map([['owner', { id: 'owner', role: 'owner' }]]);
  for (const a of accounts) if (!a.disabled) m.set(a.id, a);
  return m;
}
const userOk = (u, ws) => !!u && (u.role === 'owner' || u.ws === ws);

/** Task này nhắc tới ai: giao riêng -> người đó; chung -> mọi người */
const forUser = (t, uid) => !t.assignee || t.assignee === uid;

function roomNames(data) {
  const m = {};
  for (const l of data?.locations || []) for (const r of l.rooms || []) m[r.id] = r.name;
  return m;
}

/* =================== THÔNG BÁO ĐẨY (Web Push) =================== */
let vapidCache = null;
export async function vapidKeys() {
  if (vapidCache) return vapidCache;
  const pub = envClean(process.env.VAPID_PUBLIC_KEY); const priv = envClean(process.env.VAPID_PRIVATE_KEY);
  if (pub && priv) return (vapidCache = { publicKey: pub, privateKey: priv });
  const saved = (await getJSON(VAPID))?.data;
  if (saved?.publicKey && dec(saved.privateKey)) return (vapidCache = { publicKey: saved.publicKey, privateKey: dec(saved.privateKey) });
  const { default: webpush } = await import('web-push');
  const k = webpush.generateVAPIDKeys();
  try { await putJSON(VAPID, { publicKey: k.publicKey, privateKey: enc(k.privateKey), at: Date.now() }, saved ? {} : { create: true }); } catch (e) {
    if (e instanceof ConflictError) { vapidCache = null; const again = (await getJSON(VAPID))?.data; return (vapidCache = { publicKey: again.publicKey, privateKey: dec(again.privateKey) }); }
    throw e;
  }
  return (vapidCache = k);
}

export async function pushSubscribe(uid, ws, sub, ua) {
  if (!sub?.endpoint || !/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) throw new HttpError(400, 'Đăng ký thông báo không hợp lệ');
  const rec = await updateJSON(pFile(uid), (d) => {
    const subs = (d?.subs || []).filter((s) => s.endpoint !== sub.endpoint);
    subs.push({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }, ws, ua: String(ua || '').slice(0, 120), at: Date.now() });
    return { subs: subs.slice(-8) };
  }, null);
  await setIndex('push', uid, rec.subs.map((s) => s.ws));
  return rec.subs.length;
}
export async function pushUnsubscribe(uid, endpoint) {
  const rec = await updateJSON(pFile(uid), (d) => ({ subs: (d?.subs || []).filter((s) => s.endpoint !== endpoint) }), null);
  await setIndex('push', uid, rec.subs.map((s) => s.ws));
}
export async function pushInfo(uid, ws) {
  const subs = (await getJSON(pFile(uid)))?.data?.subs || [];
  return { devices: subs.filter((s) => s.ws === ws).length, cron: envClean(process.env.CRON_SECRET).length >= 16 };
}

/** Gửi 1 thông báo tới mọi máy của uid đang bật cho ws (ws = null: mọi máy). Máy đã huỷ đăng ký thì xoá. */
export async function pushSend(uid, ws, payload) {
  const rec = (await getJSON(pFile(uid)))?.data;
  const subs = (rec?.subs || []).filter((s) => !ws || s.ws === ws);
  if (!subs.length) return { sent: 0 };
  const { default: webpush } = await import('web-push');
  const v = await vapidKeys();
  const subject = `mailto:${envClean(process.env.VAPID_SUBJECT) || 'no-reply@hostexa.app'}`.replace(/^mailto:mailto:/, 'mailto:');
  const dead = []; let sent = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(payload), { vapidDetails: { subject, publicKey: v.publicKey, privateKey: v.privateKey }, TTL: 3600, urgency: 'high' });
      sent += 1;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) dead.push(s.endpoint); else console.error('push', e.statusCode, String(e.body || e.message).slice(0, 120));
    }
  }));
  if (dead.length) {
    const left = await updateJSON(pFile(uid), (d) => ({ subs: (d?.subs || []).filter((s) => !dead.includes(s.endpoint)) }), null);
    await setIndex('push', uid, left.subs.map((s) => s.ws));
  }
  return { sent };
}

const remindText = (m) => (m === 0 ? 'Đến giờ' : `Còn ${REMINDS.find((r) => r.v === m)?.label || `${m} phút`}`);
/** Thời điểm nhắc (ms, UTC) của 1 lần task: giờ làm (cả ngày = 08:00) giờ VN trừ số phút nhắc trước */
export const fireAt = (occ, time, remind) => Date.parse(`${occ}T${time || '08:00'}:00+07:00`) - Number(remind) * 60000;
const WINDOW = 20 * 60000; // cron chạy trễ tối đa 20 phút vẫn gửi

/** Chạy định kỳ (5 phút / lần): gửi thông báo cho các lần task tới giờ nhắc */
export async function pushDue(now = Date.now()) {
  const idx = await loadIndex();
  const byWs = new Map();
  for (const [uid, list] of Object.entries(idx.push || {})) for (const w of list) byWs.set(w, [...(byWs.get(w) || []), uid]);
  if (!byWs.size) return { sent: 0 };
  const users = await validUsers();
  const sentLog = (await getJSON(SENT))?.data || {};
  const fresh = {}; let sent = 0;
  const today = new Date(now + 7 * 3600e3).toISOString().slice(0, 10);
  for (const [ws, uids] of byWs) {
    const data = (await getJSON(wsFile(ws)))?.data?.data;
    if (!data) continue;
    const rooms = roomNames(data);
    const items = taskInstances((data.tasks || []).filter((t) => t.remind != null), addDays(today, -1), addDays(today, 2));
    for (const it of items) {
      if (it.done) continue;
      const at = fireAt(it.occ, it.time, it.remind);
      if (at > now || at <= now - WINDOW) continue;
      const k = `${ws}:${it.id}:${it.occ}:${it.time || ''}:${it.remind}`;
      if (sentLog[k] || fresh[k]) continue;
      fresh[k] = now;
      const room = rooms[it.roomId] || '';
      const payload = {
        title: `⏰ ${it.title}`,
        body: [`${remindText(it.remind)}${it.time ? ` · ${it.time}` : ''}`, room, it.desc].filter(Boolean).join(' · ').slice(0, 180),
        tag: `task-${it.id}-${it.occ}`, url: `/?tab=tasks`,
      };
      for (const uid of uids) {
        if (!forUser(it, uid) || !userOk(users.get(uid), ws)) continue;
        sent += (await pushSend(uid, ws, payload)).sent;
      }
    }
  }
  if (Object.keys(fresh).length) {
    const cut = now - 3 * 864e5;
    await updateJSON(SENT, (d) => Object.fromEntries(Object.entries({ ...(d || {}), ...fresh }).filter(([, t]) => t > cut)), {});
  }
  return { sent, reminders: Object.keys(fresh).length };
}
