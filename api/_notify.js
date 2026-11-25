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
import { hasFeature, planExpired } from '../src/lib/plan.js';

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
export async function loadIndex() { return (await getJSON(INDEX, { etag: false, cache: true }))?.data || { push: {} }; }
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
  const saved = (await getJSON(VAPID, { etag: false, cache: true }))?.data;
  if (saved?.publicKey && dec(saved.privateKey)) return (vapidCache = { publicKey: saved.publicKey, privateKey: dec(saved.privateKey) });
  const { default: webpush } = await import('web-push');
  const k = webpush.generateVAPIDKeys();
  try { await putJSON(VAPID, { publicKey: k.publicKey, privateKey: enc(k.privateKey), at: Date.now() }, saved ? {} : { create: true }); } catch (e) {
    if (e instanceof ConflictError) { vapidCache = null; const again = (await getJSON(VAPID, { etag: false }))?.data; return (vapidCache = { publicKey: again.publicKey, privateKey: dec(again.privateKey) }); }
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
  const rec = (await getJSON(pFile(uid), { etag: false }))?.data;
  const subs = rec?.subs || [];
  return { devices: subs.filter((s) => s.ws === ws).length, cron: envClean(process.env.CRON_SECRET).length >= 16, prefs: prefsOf(rec) };
}
export async function pushSetPrefs(uid, prefs) {
  const clean = Object.fromEntries(PREF_KEYS.filter((k) => typeof prefs?.[k] === 'boolean').map((k) => [k, prefs[k]]));
  const rec = await updateJSON(pFile(uid), (d) => ({ ...(d || { subs: [] }), prefs: { ...(d?.prefs || {}), ...clean } }), null);
  return prefsOf(rec);
}

/** Gửi 1 thông báo tới mọi máy của uid đang bật cho ws (ws = null: mọi máy). Máy đã huỷ đăng ký thì xoá. */
export async function pushSend(uid, ws, payload, pref = null, { inbox = !!pref } = {}) {
  const rec = (await getJSON(pFile(uid), { etag: false }))?.data;
  if (pref && rec?.prefs?.[pref] === false) return { sent: 0, off: true };
  const subs = (rec?.subs || []).filter((s) => !ws || s.ws === ws);
  if (!subs.length) return { sent: 0 };
  const { default: webpush } = await import('web-push');
  const v = await vapidKeys();
  const subject = `mailto:${envClean(process.env.VAPID_SUBJECT) || 'no-reply@hostexa.app'}`.replace(/^mailto:mailto:/, 'mailto:');
  const dead = []; const errors = []; let sent = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(payload), { vapidDetails: { subject, publicKey: v.publicKey, privateKey: v.privateKey }, TTL: 3600, urgency: 'high', timeout: 8000 });
      sent += 1;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) dead.push(s.endpoint);
      else {
        const why = `${e.statusCode || e.code || 'lỗi'} ${String(e.body || e.message || '').slice(0, 80)}`.trim();
        errors.push(why);
        console.error('push', why);
      }
    }
  }));
  if (dead.length) {
    const left = await updateJSON(pFile(uid), (d) => ({ ...(d || {}), subs: (d?.subs || []).filter((s) => !dead.includes(s.endpoint)) }), null);
    await setIndex('push', uid, left.subs.map((s) => s.ws));
  }
  if (sent && inbox) await inboxAdd(uid, ws, payload, pref || 'daily').catch((e) => console.error('inbox', e.message));
  return { sent, errors, devices: subs.length };
}

/* ---------- Hộp thông báo: các thông báo đã gửi tới người dùng (xem lại trong app, nút chuông) ---------- */
const iFile = (uid) => `notify/inbox/${uid}.json`;
const INBOX_MAX = 80;
const INBOX_DAYS = 14;
export async function inboxAdd(uid, ws, payload, kind, now = Date.now()) {
  const item = { id: `${now.toString(36)}${randomBytes(3).toString('hex')}`, at: now, ws, kind, title: String(payload.title || '').slice(0, 120), body: String(payload.body || '').slice(0, 240), url: payload.url || '/' };
  const cut = now - INBOX_DAYS * 864e5;
  await updateJSON(iFile(uid), (d) => {
    const items = (d?.items || []).filter((x) => x.at > cut && !(payload.tag && x.tag === payload.tag));
    return { items: [{ ...item, ...(payload.tag ? { tag: payload.tag } : {}) }, ...items].slice(0, INBOX_MAX) };
  }, { items: [] });
}
/** Thông báo của 1 người trong 1 cơ sở, mới nhất trước */
export async function inboxList(uid, ws) {
  const cut = Date.now() - INBOX_DAYS * 864e5;
  const items = (await getJSON(iFile(uid), { etag: false }))?.data?.items || [];
  return items.filter((x) => x.ws === ws && x.at > cut).map(({ tag, ...x }) => x); // eslint-disable-line no-unused-vars
}

/* ---------- Nhật ký lượt chạy (để chủ hệ thống xem trong app) ---------- */
const LASTRUN = 'notify/lastrun.json';
/** Ghi kết quả một lượt cron: giữ 30 lượt có việc gần nhất + trạng thái tổng quan theo ngày / cơ sở */
export async function saveRun(entry, daily = {}) {
  await updateJSON(LASTRUN, (d) => {
    const prev = d || { runs: [], daily: {} };
    const busy = entry.errors?.length || entry.sent || entry.notices;
    const runs = busy ? [entry, ...(prev.runs || [])].slice(0, 30) : prev.runs || [];
    const cut = new Date(entry.at - 7 * 864e5).toISOString().slice(0, 10);
    const dly = Object.fromEntries(Object.entries({ ...(prev.daily || {}), ...daily }).filter(([k]) => k.split('|')[1] >= cut));
    return { at: entry.at, last: entry, runs, daily: dly };
  }, { runs: [], daily: {} }).catch((e) => console.error('lastrun', e.message));
}
export async function loadRun() { return (await getJSON(LASTRUN, { etag: false }))?.data || null; }

const remindText = (m) => (m === 0 ? 'Đến giờ' : `Còn ${REMINDS.find((r) => r.v === m)?.label || `${m} phút`}`);
/** Thời điểm nhắc (ms, UTC) của 1 lần task: giờ làm (cả ngày = 08:00) giờ VN trừ số phút nhắc trước */
export const fireAt = (occ, time, remind) => Date.parse(`${occ}T${time || '08:00'}:00+07:00`) - Number(remind) * 60000;
const WINDOW = 20 * 60000; // cron chạy trễ tối đa 20 phút vẫn gửi

/**
 * Dữ liệu dùng chung cho MỘT lượt cron: mỗi file chỉ đọc tối đa 1 lần, đọc không cần ETag (1 thao tác),
 * file ít đổi dùng cache CDN. sent.json chỉ đọc khi thật sự có mục tới giờ.
 */
export function cronCtx() {
  const c = new Map();
  const once = (key, fn) => { if (!c.has(key)) c.set(key, fn()); return c.get(key); };
  return {
    index: () => once('index', loadIndex),
    users: () => once('users', validUsers),
    workspaces: () => once('wss', () => loadWorkspaces().then((r) => r.workspaces)),
    /** cơ sở gói dùng thử (không có thông báo đẩy) */
    // cơ sở không được gửi thông báo: gói không có thông báo đẩy (dùng thử) hoặc gói đã hết hạn
    trial: () => once('trial', () => loadWorkspaces().then((r) => new Set(r.workspaces.filter((w) => !hasFeature(w, 'push') || planExpired(w)).map((w) => w.id)))),
    sent: () => once('sent', () => getJSON(SENT, { etag: false }).then((r) => r?.data || {})),
    ws: (id) => once(`ws:${id}`, () => getJSON(wsFile(id), { etag: false, cache: true }).then((r) => r?.data?.data || null)),
    fin: (id) => once(`fin:${id}`, () => getJSON(`fin/${id}.json`, { etag: false, cache: true }).then((r) => r?.data?.data || {})),
  };
}

/** Chạy định kỳ (5 phút / lần): gửi thông báo cho các lần task tới giờ nhắc */
export async function pushDue(now = Date.now(), ctx = cronCtx()) {
  const idx = await ctx.index();
  const byWs = new Map();
  for (const [uid, list] of Object.entries(idx.push || {})) for (const w of list) byWs.set(w, [...(byWs.get(w) || []), uid]);
  if (!byWs.size) return { sent: 0 };
  const users = await ctx.users();
  const fresh = {}; let sent = 0;
  const today = new Date(now + 7 * 3600e3).toISOString().slice(0, 10);
  const trial = await ctx.trial();
  for (const [ws, uids] of byWs) {
    if (trial.has(ws)) continue;
    const data = await ctx.ws(ws);
    if (!data) continue;
    const rooms = roomNames(data);
    const items = taskInstances((data.tasks || []).filter((t) => t.remind != null), addDays(today, -1), addDays(today, 2));
    for (const it of items) {
      if (it.done) continue;
      const at = fireAt(it.occ, it.time, it.remind);
      if (at > now || at <= now - WINDOW) continue;
      const k = `${ws}:${it.id}:${it.occ}:${it.time || ''}:${it.remind}`;
      if ((await ctx.sent())[k] || fresh[k]) continue;
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
const DAILY_UNTIL = '10:00'; // hạn chót gửi bù tổng quan buổi sáng
const canMoney = (u) => u?.role === 'owner' || u?.role === 'admin';

/** Đặt phòng hiện có của cơ sở (cùng cách tính với app: ẩn bản sao do đặt phòng trực tiếp, bỏ lịch khoá) */
export async function wsBookings(data) {
  const cals = (data.calendars || []).filter((c) => c.url);
  const events = {};
  await Promise.all(cals.map(async (c) => { events[c.id] = await eventsOf(c, { maxAge: FEED_AGE }); }));
  return getBookings({ calendars: data.calendars || [], manual: data.manual || [], overrides: data.overrides || {}, events }).filter((b) => !b.blocked);
}

/** Chạy mỗi 5 phút cùng nhắc task: gửi tổng quan lúc 08:00 và báo trả / nhận phòng trước 1 giờ */
export async function stayDue(now = Date.now(), { collect = false, ctx = cronCtx() } = {}) {
  const log = [];
  const idx = await ctx.index();
  const byWs = new Map();
  for (const [uid, list] of Object.entries(idx.push || {})) for (const w of list) byWs.set(w, [...(byWs.get(w) || []), uid]);
  if (!byWs.size) return { sent: 0, errors: [], daily: {} };
  const users = await ctx.users();
  const multi = new Map(); // uid -> số cơ sở đang nhận (để ghi tên cơ sở khi > 1)
  for (const uids of byWs.values()) for (const u of uids) multi.set(u, (multi.get(u) || 0) + 1);
  const fresh = {}; let sent = 0;
  const errors = []; const daily = {};
  const today = new Date(now + 7 * 3600e3).toISOString().slice(0, 10);
  // báo trả / nhận phòng: từ mốc "trước 1 giờ" cho tới đúng giờ đó – cron trễ / chạy thưa (15 phút) vẫn gửi bù, ghi "Còn N phút"
  const stayOpen = (t) => now >= fireAt(today, t, BEFORE) && now < fireAt(today, t, 0);
  // tổng quan: gửi từ 08:00, gửi bù tới 10:00 nếu lượt trước lỗi / trễ (chống trùng theo ngày + người)
  const dailyNow = now >= fireAt(today, '08:00', 0) && now < fireAt(today, DAILY_UNTIL, 0);

  const trial = await ctx.trial();
  for (const [ws, uidsAll] of byWs) {
    if (trial.has(ws)) continue;
    const uids = uidsAll.filter((u) => userOk(users.get(u), ws));
    if (!uids.length) continue;
    const data = await ctx.ws(ws);
    if (!data) continue;
    // chỉ tải lịch sàn khi lượt này có việc: tổng quan buổi sáng chưa gửi, hoặc đang trong khung "trước 1 giờ" của giờ nhận / trả phòng
    const times = new Set();
    for (const c of data.calendars || []) { times.add(c.checkIn || '14:00'); times.add(c.checkOut || '12:00'); }
    for (const m of data.manual || []) if (m.start === today || m.end === today) { times.add(m.checkIn || '14:00'); times.add(m.checkOut || '12:00'); }
    const stayWin = [...times].some((t) => /^\d{2}:\d{2}$/.test(t) && stayOpen(t));
    const dailyTodo = dailyNow && (await Promise.all(uids.map(async (u) => !(await ctx.sent())[`${ws}:daily:${today}:${u}`]))).some(Boolean);
    if (!dailyTodo && !stayWin) continue;
    const sentLog = await ctx.sent();
    const pending = [];
    let bookings;
    try { bookings = await wsBookings(data); } catch (e) {
      errors.push(`Đọc lịch ${ws}: ${String(e.message).slice(0, 80)}`);
      if (dailyNow) daily[`${ws}|${today}`] = { at: now, sent: 0, failed: uids.length, skipped: 0, errors: [`đọc lịch: ${String(e.message).slice(0, 60)}`] };
      continue;
    }
    const rooms = roomNames(data);
    const fin = await ctx.fin(ws);
    const dueOf = (b) => (b.source === 'manual' ? balanceDue(fin.prices?.[b.id]) : 0);
    const wsName = (await ctx.workspaces()).find((w) => w.id === ws)?.name || data.property?.name || '';

    if (dailyTodo) {
      for (const uid of uids) {
        const k = `${ws}:daily:${today}:${uid}`;
        if (sentLog[k] || fresh[k]) continue;
        const payload = dailyPayload({ u: users.get(uid), bookings, today, dueOf, wsName: multi.get(uid) > 1 ? wsName : '', tag: `daily-${ws}-${today}` });
        pending.push({ k, uid, pref: 'daily', daily: true, payload });
      }
    }

    for (const b of bookings) {
      for (const kind of ['out', 'in']) {
        if ((kind === 'out' ? b.end : b.start) !== today) continue;
        const time = /^\d{2}:\d{2}$/.test(kind === 'out' ? b.checkOut : b.checkIn) ? (kind === 'out' ? b.checkOut : b.checkIn) : (kind === 'out' ? '12:00' : '14:00');
        if (!stayOpen(time)) continue;
        const left = Math.round((fireAt(today, time, 0) - now) / 60000);
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
              body: [left >= 55 ? 'Còn 1 giờ' : `Còn ${Math.max(1, left)} phút`, b.platform, guest, extra, multi.get(uid) > 1 ? wsName : ''].filter(Boolean).join(' · ').slice(0, 180),
              tag: `${kind}-${b.id}-${today}`, url: '/?tab=home',
            },
          });
        }
      }
    }

    const dk = `${ws}|${today}`;
    for (const it of pending) {
      if (collect) log.push({ uid: it.uid, ...it.payload });
      let r;
      try { r = await pushSend(it.uid, ws, it.payload, it.pref); } catch (e) { r = { sent: 0, errors: [String(e.message).slice(0, 80)], devices: 1 }; }
      sent += r.sent;
      // chỉ đánh dấu "đã gửi" khi tới được ít nhất 1 máy, hoặc người đó tắt loại này / không còn máy nào -> lượt sau còn thử lại
      if (r.sent > 0 || r.off || !r.devices) fresh[it.k] = now;
      if (r.errors?.length) errors.push(`${it.payload.title}: ${r.errors[0]}`);
      if (it.daily) {
        const st = daily[dk] || { at: now, sent: 0, failed: 0, skipped: 0, errors: [] };
        if (r.sent) st.sent += 1; else if (r.off || !r.devices) st.skipped += 1; else { st.failed += 1; st.errors = [...st.errors, ...(r.errors || [])].slice(0, 3); }
        st.at = now;
        daily[dk] = st;
      }
    }
  }
  if (Object.keys(fresh).length) {
    const cut = now - 3 * 864e5;
    await updateJSON(SENT, (d) => Object.fromEntries(Object.entries({ ...(d || {}), ...fresh }).filter(([, t]) => t > cut)), {});
  }
  return { sent, notices: Object.keys(fresh).length, errors, daily, ...(collect ? { log } : {}) };
}

/** Nội dung thông báo tổng quan buổi sáng cho 1 người */
function dailyPayload({ u, bookings, today, dueOf, wsName = '', tag }) {
  const outs = bookings.filter((b) => b.end === today);
  const ins = bookings.filter((b) => b.start === today);
  const dues = bookings.filter((b) => b.source === 'manual' && b.start <= today && b.end >= today && dueOf(b) > 0);
  const dueSum = dues.reduce((a, b) => a + dueOf(b), 0);
  const money = canMoney(u) && dues.length;
  let body;
  if (!outs.length && !ins.length && !money) body = 'Hôm nay không có lượt nhận / trả phòng nào.';
  else {
    const parts = [`${outs.length} lượt trả phòng`, `${ins.length} lượt nhận phòng`];
    if (canMoney(u)) parts.push(`${dues.length} khoản phải thu tiền phòng${dues.length ? ` (${fmtShort(dueSum)})` : ''}`);
    body = `Hôm nay có ${parts.slice(0, -1).join(', ')} và ${parts[parts.length - 1]}.`;
  }
  return { title: `☀️ Chào buổi sáng${u?.name ? `, ${u.name}` : ''}${wsName ? ` · ${wsName}` : ''}`, body, tag, url: '/?tab=home' };
}

/** Gửi ngay bản tổng quan hôm nay cho 1 người (nút "Gửi tổng quan ngay" để kiểm tra) */
export async function dailyNow(user, ws, now = Date.now()) {
  const data = (await getJSON(wsFile(ws), { etag: false }))?.data?.data;
  if (!data) throw new HttpError(404, 'Cơ sở chưa có dữ liệu');
  const today = new Date(now + 7 * 3600e3).toISOString().slice(0, 10);
  const bookings = await wsBookings(data);
  const fin = canMoney(user) ? (await getJSON(`fin/${ws}.json`, { etag: false }))?.data?.data || {} : {};
  const dueOf = (b) => (b.source === 'manual' ? balanceDue(fin.prices?.[b.id]) : 0);
  const payload = dailyPayload({ u: user, bookings, today, dueOf, tag: `daily-test-${ws}` });
  const r = await pushSend(user.id, ws, payload, null, { inbox: true });
  if (!r.devices) throw new HttpError(400, 'Máy này chưa bật thông báo');
  if (!r.sent) throw new HttpError(502, `Không gửi được: ${r.errors?.[0] || 'không rõ lỗi'}`);
  return { sent: r.sent, title: payload.title, body: payload.body };
}
