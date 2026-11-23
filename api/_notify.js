// Thông báo đẩy (Web Push) tới các máy đã bật: nhắc task, tổng quan 8:00, trả / nhận phòng trước 1 giờ.
// Ai nhận: task giao cho ai -> người đó; task "Chung" -> mọi người của cơ sở đã bật thông báo.
// File trên Blob (bí mật được mã hoá bằng khoá suy ra từ AUTH_SECRET):
//   notify/index.json        { push: { [uid]: [ws] } }   – ai nhận nhắc của cơ sở nào
//   notify/push/<uid>.json   { subs: [{ endpoint, keys, ws, ua, at }], prefs: { daily, checkout, checkin, task } }
//   notify/vapid.json        { publicKey, privateKey(enc) }   – tự tạo lần đầu nếu không có biến VAPID_*
//   notify/sent.json         { [khoá lần nhắc]: thời điểm gửi }   – chống gửi trùng
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { getJSON, putJSON, updateJSON, ConflictError } from './_store.js';
import { envClean, loadAccounts, wsFile } from './_auth.js';
import { HttpError } from './_http.js';
import { taskInstances, REMINDS } from '../src/lib/tasks.js';
import { addDays } from '../src/lib/dates.js';
import { getBookings } from '../src/lib/derive.js';
import { balanceDue } from '../src/lib/fin.js';
import { fmtShort } from '../src/lib/money.js';
import { eventsOf } from './_feeds.js';
import { loadWorkspaces } from './_auth.js';

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
  const m = new Map([['owner', { id: 'owner', role: 'owner', name: 'Chủ hệ thống' }]]);
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
    return { ...(d || {}), subs: subs.slice(-8) };
  }, null);
  await setIndex('push', uid, rec.subs.map((s) => s.ws));
  return rec.subs.length;
}
export async function pushUnsubscribe(uid, endpoint) {
  const rec = await updateJSON(pFile(uid), (d) => ({ ...(d || {}), subs: (d?.subs || []).filter((s) => s.endpoint !== endpoint) }), null);
  await setIndex('push', uid, rec.subs.map((s) => s.ws));
}
/** Loại thông báo người dùng bật / tắt (mặc định bật hết) */
export const PREF_KEYS = ['daily', 'checkout', 'checkin', 'task'];
const prefsOf = (rec) => Object.fromEntries(PREF_KEYS.map((k) => [k, rec?.prefs?.[k] !== false]));

export async function pushInfo(uid, ws) {
  const rec = (await getJSON(pFile(uid)))?.data;
  const subs = rec?.subs || [];
  return { devices: subs.filter((s) => s.ws === ws).length, cron: envClean(process.env.CRON_SECRET).length >= 16, prefs: prefsOf(rec) };
}
export async function pushSetPrefs(uid, prefs) {
  const clean = Object.fromEntries(PREF_KEYS.filter((k) => typeof prefs?.[k] === 'boolean').map((k) => [k, prefs[k]]));
  const rec = await updateJSON(pFile(uid), (d) => ({ ...(d || { subs: [] }), prefs: { ...(d?.prefs || {}), ...clean } }), null);
  return prefsOf(rec);
}

/** Gửi 1 thông báo tới mọi máy của uid đang bật cho ws (ws = null: mọi máy). Máy đã huỷ đăng ký thì xoá. */
export async function pushSend(uid, ws, payload, pref = null) {
  const rec = (await getJSON(pFile(uid)))?.data;
  if (pref && rec?.prefs?.[pref] === false) return { sent: 0, off: true };
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
    const left = await updateJSON(pFile(uid), (d) => ({ ...(d || {}), subs: (d?.subs || []).filter((s) => !dead.includes(s.endpoint)) }), null);
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
        sent += (await pushSend(uid, ws, payload, 'task')).sent;
      }
    }
  }
  if (Object.keys(fresh).length) {
    const cut = now - 3 * 864e5;
    await updateJSON(SENT, (d) => Object.fromEntries(Object.entries({ ...(d || {}), ...fresh }).filter(([, t]) => t > cut)), {});
  }
  return { sent, reminders: Object.keys(fresh).length };
}

/* =================== TỔNG QUAN 8:00 + TRẢ / NHẬN PHÒNG TRƯỚC 1 GIỜ =================== */
const FEED_AGE = 60 * 60e3; // lịch sàn tải lại tối đa 1 lần / giờ
const BEFORE = 60; // phút báo trước giờ trả / nhận phòng
const canMoney = (u) => u?.role === 'owner' || u?.role === 'admin';

/** Đặt phòng hiện có của cơ sở (cùng cách tính với app: ẩn bản sao do đặt phòng trực tiếp, bỏ lịch khoá) */
export async function wsBookings(data) {
  const cals = (data.calendars || []).filter((c) => c.url);
  const events = {};
  await Promise.all(cals.map(async (c) => { events[c.id] = await eventsOf(c, { maxAge: FEED_AGE }); }));
  return getBookings({ calendars: data.calendars || [], manual: data.manual || [], overrides: data.overrides || {}, events }).filter((b) => !b.blocked);
}

/** Chạy mỗi 5 phút cùng nhắc task: gửi tổng quan lúc 08:00 và báo trả / nhận phòng trước 1 giờ */
export async function stayDue(now = Date.now(), { collect = false } = {}) {
  const log = [];
  const idx = await loadIndex();
  const byWs = new Map();
  for (const [uid, list] of Object.entries(idx.push || {})) for (const w of list) byWs.set(w, [...(byWs.get(w) || []), uid]);
  if (!byWs.size) return { sent: 0 };
  const users = await validUsers();
  const { workspaces } = await loadWorkspaces();
  const multi = new Map(); // uid -> số cơ sở đang nhận (để ghi tên cơ sở khi > 1)
  for (const uids of byWs.values()) for (const u of uids) multi.set(u, (multi.get(u) || 0) + 1);
  const sentLog = (await getJSON(SENT))?.data || {};
  const fresh = {}; let sent = 0;
  const today = new Date(now + 7 * 3600e3).toISOString().slice(0, 10);
  const inWindow = (at) => at <= now && at > now - WINDOW;
  const dailyNow = inWindow(fireAt(today, '08:00', 0));

  for (const [ws, uidsAll] of byWs) {
    const uids = uidsAll.filter((u) => userOk(users.get(u), ws));
    if (!uids.length) continue;
    const data = (await getJSON(wsFile(ws)))?.data?.data;
    if (!data) continue;
    // chỉ tải lịch sàn khi lượt này có thể có việc: 08:00, hoặc đang trong khung "trước 1 giờ" của một giờ nhận / trả phòng
    const times = new Set();
    for (const c of data.calendars || []) { times.add(c.checkIn || '14:00'); times.add(c.checkOut || '12:00'); }
    for (const m of data.manual || []) if (m.start === today || m.end === today) { times.add(m.checkIn || '14:00'); times.add(m.checkOut || '12:00'); }
    if (!dailyNow && ![...times].some((t) => /^\d{2}:\d{2}$/.test(t) && inWindow(fireAt(today, t, BEFORE)))) continue;
    const pending = [];
    const bookings = await wsBookings(data);
    const rooms = roomNames(data);
    const fin = (await getJSON(`fin/${ws}.json`))?.data?.data || {};
    const dueOf = (b) => (b.source === 'manual' ? balanceDue(fin.prices?.[b.id]) : 0);
    const wsName = workspaces.find((w) => w.id === ws)?.name || data.property?.name || '';

    if (dailyNow) {
      const outs = bookings.filter((b) => b.end === today);
      const ins = bookings.filter((b) => b.start === today);
      const dues = bookings.filter((b) => b.source === 'manual' && b.start <= today && b.end >= today && dueOf(b) > 0);
      const dueSum = dues.reduce((a, b) => a + dueOf(b), 0);
      for (const uid of uids) {
        const k = `${ws}:daily:${today}:${uid}`;
        if (sentLog[k] || fresh[k]) continue;
        const u = users.get(uid);
        const money = canMoney(u) && dues.length;
        let body;
        if (!outs.length && !ins.length && !money) body = 'Hôm nay không có lượt nhận / trả phòng nào.';
        else {
          const parts = [`${outs.length} lượt trả phòng`, `${ins.length} lượt nhận phòng`];
          if (canMoney(u)) parts.push(`${dues.length} khoản phải thu tiền phòng${dues.length ? ` (${fmtShort(dueSum)})` : ''}`);
          body = `Hôm nay có ${parts.slice(0, -1).join(', ')} và ${parts[parts.length - 1]}.`;
        }
        pending.push({ k, uid, pref: 'daily', payload: { title: `☀️ Chào buổi sáng${u?.name ? `, ${u.name}` : ''}${multi.get(uid) > 1 && wsName ? ` · ${wsName}` : ''}`, body, tag: `daily-${ws}-${today}`, url: '/?tab=home' } });
      }
    }

    for (const b of bookings) {
      for (const kind of ['out', 'in']) {
        if ((kind === 'out' ? b.end : b.start) !== today) continue;
        const time = /^\d{2}:\d{2}$/.test(kind === 'out' ? b.checkOut : b.checkIn) ? (kind === 'out' ? b.checkOut : b.checkIn) : (kind === 'out' ? '12:00' : '14:00');
        if (!inWindow(fireAt(today, time, BEFORE))) continue;
        const room = rooms[b.roomId] || 'Phòng';
        const guest = b.source === 'manual' ? (b.guest || '') : '';
        const due = kind === 'in' ? dueOf(b) : 0;
        for (const uid of uids) {
          const k = `${ws}:${kind}:${b.id}:${today}:${uid}`;
          if (sentLog[k] || fresh[k]) continue;
          const extra = due > 0 && canMoney(users.get(uid)) ? `còn phải thu ${fmtShort(due)}` : '';
          pending.push({
            k, uid, pref: kind === 'out' ? 'checkout' : 'checkin',
            payload: {
              title: kind === 'out' ? `🧳 ${room} trả phòng lúc ${time}` : `🔑 ${room} nhận phòng lúc ${time}`,
              body: ['Còn 1 giờ', b.platform, guest, extra, multi.get(uid) > 1 ? wsName : ''].filter(Boolean).join(' · ').slice(0, 180),
              tag: `${kind}-${b.id}-${today}`, url: '/?tab=home',
            },
          });
        }
      }
    }

    for (const it of pending) {
      fresh[it.k] = now;
      if (collect) log.push({ uid: it.uid, ...it.payload });
      sent += (await pushSend(it.uid, ws, it.payload, it.pref)).sent;
    }
  }
  if (Object.keys(fresh).length) {
    const cut = now - 3 * 864e5;
    await updateJSON(SENT, (d) => Object.fromEntries(Object.entries({ ...(d || {}), ...fresh }).filter(([, t]) => t > cut)), {});
  }
  return { sent, notices: Object.keys(fresh).length, ...(collect ? { log } : {}) };
}
