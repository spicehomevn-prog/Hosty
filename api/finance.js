// Tài chính của từng cơ sở — CHỈ chủ hệ thống (owner) và admin cơ sở. Tài khoản dọn phòng luôn bị từ chối.
// Dữ liệu tách riêng khỏi ws/<id>.json (mà member tải về) để member không bao giờ nhận được số liệu tiền.
// GET /api/finance?ws=ID                    -> { version, updatedAt, updatedBy, data }
// PUT /api/finance { ws, baseVersion, data } -> { version, updatedAt }   (409 nếu bản trên máy chủ đã đổi)
// POST /api/finance?ws=ID&action=ota          -> lấy giá Airbnb / Booking.com / Agoda theo ngày qua Apify ngay (tối đa 2 lần / tháng / cơ sở)
// GET /api/finance?cron=ota (Authorization: Bearer CRON_SECRET) -> Vercel Cron ngày 1 hằng tháng, mọi cơ sở
import { timingSafeEqual } from 'node:crypto';
import { route, send, readBody, query, HttpError, MAX_BYTES } from './_http.js';
import { getJSON, putJSON, updateJSON, ConflictError } from './_store.js';
import { requireUser, canAccess, loadWorkspaces, envClean, requireFeature, wsFile } from './_auth.js';
import { isVip } from '../src/lib/plan.js';
import {
  resolveAirbnb, runAirbnbCalendars, resolveBooking, runBookingCalendars, agodaId, runAgodaNights, parseAgodaNight, usdVnd,
  OtaError, AIRBNB_COST, BOOKING_COST, AGODA_COST, OTA_MONTHS,
} from './_apify.js';
import { wsBookings } from './_notify.js';
import { addDays } from '../src/lib/dates.js';

export const FIN_KEYS = ['settings', 'rateTable', 'dayDiscount', 'stayDiscount', 'otaListings', 'otaRates', 'otaRun', 'prices', 'expenses', 'history', 'roomMap', 'directRates', 'platformRates', 'otaManual'];
export const finFile = (ws) => `fin/${ws}.json`;
const pick = (d) => Object.fromEntries(FIN_KEYS.filter((k) => d[k] !== undefined).map((k) => [k, d[k]]));

async function requireFinance(req, ws) {
  const user = await requireUser(req);
  if (user.role !== 'owner' && user.role !== 'admin') throw new HttpError(403, 'Chỉ chủ hệ thống và admin cơ sở xem được tài chính');
  if (!ws || !canAccess(user, ws)) throw new HttpError(403, 'Không có quyền với cơ sở này');
  await requireFeature(ws, 'finance'); // gói dùng thử không có Tài chính; gói hết hạn bị chặn
  return user;
}

export const OTA_SOURCES = ['Airbnb', 'Booking.com', 'Agoda'];
export const MANUAL_PER_MONTH = 2; // nút "Cập nhật giá các sàn ngay": tối đa 2 lần / tháng / cơ sở (cron hằng tháng không tính)
const KEEP_DAYS = 400; // giữ giá sàn tới ~13 tháng trước (giá đã chốt nằm trong sổ của app)
const FX_DEFAULT = 26000; // tỷ giá USD -> VND dự phòng khi không lấy được tỷ giá tự động / chưa nhập
const vnDay = (t) => new Date(t + 7 * 3600e3).toISOString().slice(0, 10);
export const vnMonth = (t) => vnDay(t).slice(0, 7);
const hasLinks = (listings) => Object.values(listings || {}).some((v) => OTA_SOURCES.some((p) => v?.[p]));

function cronAllowed(req) {
  const secret = envClean(process.env.CRON_SECRET);
  if (!secret) return false;
  const got = Buffer.from(String(req.headers?.authorization || ''));
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Nhóm phòng theo mã / trang chung trên sàn: { [mã]: [roomId…] } + lỗi đọc link theo phòng */
async function groupBy(listings, platform, resolve) {
  const groups = {}; const errors = {}; const ids = {}; const memo = new Map();
  await Promise.all(Object.entries(listings).filter(([, v]) => v?.[platform]).map(async ([roomId, v]) => {
    const link = String(v[platform]).trim();
    try {
      if (!memo.has(link)) memo.set(link, resolve(link));
      const id = await memo.get(link);
      ids[roomId] = id;
    } catch (e) { errors[roomId] = e.message; }
  }));
  for (const [roomId, id] of Object.entries(ids)) (groups[typeof id === 'string' ? id : `${id.country}/${id.pagename}`] ||= { id, rooms: [] }).rooms.push(roomId);
  return { groups, errors, ids };
}
const idText = (id) => (typeof id === 'string' ? id : id ? `${id.country}/${id.pagename}` : '');

/** Airbnb: lịch giá từng listing */
async function airbnbSource(listings, now) {
  const { groups, errors, ids } = await groupBy(listings, 'Airbnb', resolveAirbnb);
  const keys = Object.keys(groups);
  const res = keys.length ? await runAirbnbCalendars(keys.map((k) => ({ key: k, id: groups[k].id })), { now: new Date(now) }) : {};
  return collect(listings, 'Airbnb', groups, errors, ids, (k) => res[k], AIRBNB_COST * keys.length);
}

/** Booking.com: lịch giá của từng trang (nhiều phòng dùng chung 1 trang -> chung giá thấp nhất của trang) */
async function bookingSource(listings, now) {
  const { groups, errors, ids } = await groupBy(listings, 'Booking.com', resolveBooking);
  const keys = Object.keys(groups);
  const res = keys.length ? await runBookingCalendars(keys.map((k) => ({ key: k, ...groups[k].id })), { now: new Date(now) }) : {};
  return collect(listings, 'Booking.com', groups, errors, ids, (k) => res[k], BOOKING_COST * keys.length);
}

/**
 * Agoda: hỏi giá từng đêm từ hôm nay tới hết tháng sau, bỏ đêm mà mọi phòng dùng chung cơ sở Agoda đều đã có khách
 * (đêm đó sàn báo hết phòng, hỏi chỉ tốn tiền). Giá theo USD (Agoda không hỗ trợ VND) -> quy đổi VND.
 */
async function agodaSource(listings, ws, now, settings) {
  const { groups, errors, ids } = await groupBy(listings, 'Agoda', async (link) => {
    const id = agodaId(link);
    if (!id) throw new OtaError('Dán link Agoda có mã cơ sở (…-h123456.html hoặc hotelId=…) hoặc nhập mã cơ sở trong Agoda YCS');
    return id;
  });
  const keys = Object.keys(groups);
  if (!keys.length) return collect(listings, 'Agoda', groups, errors, ids, () => null, 0);
  const today = vnDay(now);
  const vn = new Date(now + 7 * 3600e3);
  const last = new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth() + OTA_MONTHS, 0)).toISOString().slice(0, 10);
  let busy = new Map();
  try {
    const data = (await getJSON(wsFile(ws), { etag: false }))?.data?.data;
    if (data) {
      for (const b of await wsBookings(data)) {
        for (let d = b.start; d < b.end; d = addDays(d, 1)) {
          if (!busy.has(d)) busy.set(d, new Set());
          busy.get(d).add(b.roomId);
        }
      }
    }
  } catch (e) { console.error('agoda bookings', e.message); busy = new Map(); }
  const props = keys.map((k) => {
    const nights = [];
    for (let d = today; d <= last; d = addDays(d, 1)) {
      const taken = busy.get(d);
      if (taken && groups[k].rooms.every((r) => taken.has(r))) continue;
      nights.push(d);
    }
    return { key: k, id: groups[k].id, nights };
  });
  const asked = props.reduce((a, p) => a + p.nights.length, 0);
  const [res, auto] = await Promise.all([runAgodaNights(props), usdVnd()]);
  const fx = auto || Number(settings?.usdVnd) || FX_DEFAULT;
  const roomTypes = {};
  const perRoom = {}; // roomId -> { prices, priced, available } | { error }
  for (const k of keys) {
    const r = res[k];
    for (const roomId of groups[k].rooms) {
      if (!r || r.error) { perRoom[roomId] = { error: r?.error || 'Apify không trả kết quả' }; continue; }
      const prices = {}; let available = 0;
      for (const [d, item] of Object.entries(r.items)) {
        const n = parseAgodaNight(item, listings[roomId]?.AgodaRoom || '');
        (roomTypes[k] ||= new Set());
        n.roomTypes.forEach((t) => roomTypes[k].add(t));
        if (n.price == null) continue;
        available += 1;
        prices[d] = Math.round((n.price * fx) / 1000) * 1000;
      }
      perRoom[roomId] = { prices, priced: Object.keys(prices).length, available };
    }
  }
  const out = collect(listings, 'Agoda', groups, errors, ids, null, AGODA_COST * asked, perRoom);
  out.fx = { rate: fx, auto: !!auto };
  out.nights = asked;
  out.roomTypes = Object.fromEntries(Object.entries(roomTypes).map(([k, v]) => [k, [...v].slice(0, 40)]));
  return out;
}

/** Kết quả 1 sàn theo phòng -> { ok, error, cost, rooms: { roomId: { id, ok, error, priced, available } }, prices: { roomId: {…} } } */
function collect(listings, platform, groups, errors, ids, byKey, cost, perRoom = null) {
  const rooms = {}; const prices = {};
  for (const [roomId, v] of Object.entries(listings)) {
    if (!v?.[platform]) continue;
    let r = null;
    if (perRoom) r = perRoom[roomId];
    else { const k = Object.keys(groups).find((g) => groups[g].rooms.includes(roomId)); r = k ? byKey(k) : null; }
    const err = errors[roomId] || (r ? r.error || '' : 'Apify không trả kết quả');
    rooms[roomId] = { id: idText(ids[roomId]), ok: !err, error: err, priced: r?.priced || 0, available: r?.available || 0 };
    if (!err && r?.prices) prices[roomId] = r.prices;
  }
  const list = Object.values(rooms);
  const ok = list.some((x) => x.ok);
  return { ok, error: ok ? '' : list[0]?.error || '', cost: +cost.toFixed(3), rooms, prices };
}

/**
 * Lấy giá các sàn (Airbnb, Booking.com, Agoda) cho mọi phòng có link trong otaListings, gộp vào otaRates[phòng][sàn]:
 * ngày có giá mới thì cập nhật, ngày không còn giá (đã có khách / bị chặn) giữ giá cũ. 3 sàn chạy song song, sàn lỗi không ảnh hưởng sàn khác.
 * refund: thời điểm lượt bấm tay đã giữ chỗ – trả lại lượt nếu không lấy được giá nào.
 */
async function updateOta(ws, by, { refund = 0 } = {}) {
  const cur = await getJSON(finFile(ws), { etag: false });
  const data = cur?.data?.data || {};
  const listings = data.otaListings || {};
  if (!hasLinks(listings)) throw new HttpError(400, 'Chưa có link phòng trên sàn nào trong Cài đặt tài chính');
  const now = Date.now();
  const tasks = {
    Airbnb: () => airbnbSource(listings, now),
    'Booking.com': () => bookingSource(listings, now),
    Agoda: () => agodaSource(listings, ws, now, data.settings),
  };
  const used = OTA_SOURCES.filter((p) => Object.values(listings).some((v) => v?.[p]));
  const settled = await Promise.allSettled(used.map((p) => tasks[p]()));
  const sources = {};
  used.forEach((p, i) => {
    const st = settled[i];
    if (st.status === 'fulfilled') sources[p] = st.value;
    else {
      if (!(st.reason instanceof OtaError) && !(st.reason instanceof HttpError)) console.error('ota', p, st.reason);
      const error = String(st.reason?.message || 'Không lấy được giá').slice(0, 160);
      sources[p] = { ok: false, error, cost: 0, rooms: Object.fromEntries(Object.entries(listings).filter(([, v]) => v?.[p]).map(([r]) => [r, { id: '', ok: false, error, priced: 0, available: 0 }])), prices: {} };
    }
  });
  const ok = Object.values(sources).some((x) => x.ok);
  const cut = vnDay(now - KEEP_DAYS * 864e5);
  const doc = await updateJSON(finFile(ws), (d) => {
    const next = d && d.data ? d : { version: 0, updatedAt: 0, updatedBy: '', data: {} };
    const fd = { ...next.data };
    const otaRates = { ...(fd.otaRates || {}) };
    for (const [p, src] of Object.entries(sources)) {
      for (const [roomId, prices] of Object.entries(src.prices || {})) {
        const old = Object.fromEntries(Object.entries(otaRates[roomId]?.[p] || {}).filter(([day]) => day >= cut));
        otaRates[roomId] = { ...(otaRates[roomId] || {}), [p]: { ...old, ...prices } };
      }
    }
    fd.otaRates = otaRates;
    const lean = Object.fromEntries(Object.entries(sources).map(([p, { prices, ...rest }]) => [p, rest])); // eslint-disable-line no-unused-vars
    fd.otaRun = {
      at: now, by, ok, error: ok ? '' : Object.values(sources).map((x) => x.error).find(Boolean) || 'Không lấy được giá',
      sources: lean, rooms: lean.Airbnb?.rooms || {},
    };
    if (refund && !ok && fd.otaManual?.runs) fd.otaManual = { ...fd.otaManual, runs: fd.otaManual.runs.filter((t) => t !== refund) };
    return { version: (next.version || 0) + 1, updatedAt: now, updatedBy: by, data: fd };
  }, null);
  return doc;
}

async function giveBack(ws, ticket) {
  await updateJSON(finFile(ws), (d) => (d?.data?.otaManual?.runs?.includes(ticket)
    ? { ...d, version: (d.version || 0) + 1, data: { ...d.data, otaManual: { ...d.data.otaManual, runs: d.data.otaManual.runs.filter((t) => t !== ticket) } } }
    : d), null);
}

/** Giữ chỗ 1 lượt bấm tay trong tháng (ghi trước khi gọi Apify để bấm dồn cũng không vượt). Hết lượt -> 429. */
async function takeManualRun(ws, by) {
  const now = Date.now();
  const month = vnMonth(now);
  await updateJSON(finFile(ws), (d) => {
    const next = d && d.data ? d : { version: 0, updatedAt: 0, updatedBy: '', data: {} };
    const m = next.data.otaManual?.month === month ? next.data.otaManual : { month, runs: [] };
    if (m.runs.length >= MANUAL_PER_MONTH) {
      const [y, mo] = month.split('-');
      throw new HttpError(429, `Đã dùng ${MANUAL_PER_MONTH}/${MANUAL_PER_MONTH} lần cập nhật tay trong tháng ${mo}/${y}. Giá sẽ tự cập nhật ngày 1 tháng sau.`);
    }
    return { ...next, version: (next.version || 0) + 1, updatedAt: now, updatedBy: by, data: { ...next.data, otaManual: { month, runs: [...m.runs, now] } } };
  }, null);
  return now;
}

const conflictOf = (cur) => new HttpError(409, 'Dữ liệu trên máy chủ đã thay đổi', {
  version: cur?.data.version || 0, updatedAt: cur?.data.updatedAt || 0, updatedBy: cur?.data.updatedBy || '', data: cur?.data.data || null,
});

export default route(async (req, res) => {
  if (req.method === 'GET' && query(req).get('cron') === 'ota') {
    if (!cronAllowed(req)) throw new HttpError(401, 'Không có quyền');
    const { workspaces } = await loadWorkspaces();
    const done = [];
    for (const w of workspaces) {
      if (!isVip(w)) continue; // giá tự động từ sàn (Apify) chỉ có ở tài khoản VIP
      const cur = await getJSON(finFile(w.id), { etag: false, cache: true });
      if (!hasLinks(cur?.data?.data?.otaListings)) continue;
      try { await updateOta(w.id, 'Tự cập nhật hằng tháng'); done.push(w.id); } catch (e) { console.error('ota', w.id, e.message); }
    }
    return send(res, 200, { ok: true, workspaces: done.length });
  }

  if (req.method === 'POST') {
    const q = query(req);
    const ws = q.get('ws');
    const user = await requireFinance(req, ws);
    if (q.get('action') !== 'ota') throw new HttpError(400, 'Thao tác không hợp lệ');
    await requireFeature(ws, 'ota'); // chỉ VIP
    // nút bấm tay: tối đa 2 lần / tháng / cơ sở (chủ hệ thống không giới hạn); lượt không lấy được giá nào được trả lại
    const ticket = user.role === 'owner' ? 0 : await takeManualRun(ws, user.name || user.username);
    let doc;
    try { doc = await updateOta(ws, user.name || user.username, { refund: ticket }); } catch (e) {
      if (ticket) await giveBack(ws, ticket).catch(() => {});
      throw e;
    }
    return send(res, 200, { version: doc.version, otaRun: doc.data.otaRun, otaManual: doc.data.otaManual || null });
  }

  if (req.method === 'GET') {
    const ws = query(req).get('ws');
    await requireFinance(req, ws);
    const cur = await getJSON(finFile(ws), { etag: false });
    const doc = cur?.data || { version: 0, updatedAt: 0, updatedBy: '', data: null };
    return send(res, 200, { version: doc.version, updatedAt: doc.updatedAt, updatedBy: doc.updatedBy, data: doc.data });
  }

  if (req.method === 'PUT') {
    const body = await readBody(req);
    const { ws } = body;
    const user = await requireFinance(req, ws);
    if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) throw new HttpError(400, 'Dữ liệu không hợp lệ');
    const data = pick(body.data);
    if (data.expenses !== undefined && !Array.isArray(data.expenses)) throw new HttpError(400, 'Dữ liệu không hợp lệ');
    if (JSON.stringify(data).length > MAX_BYTES) throw new HttpError(413, 'Dữ liệu quá lớn');

    const cur = await getJSON(finFile(ws));
    const curVersion = cur ? cur.data.version : 0;
    // số lượt cập nhật giá bằng tay chỉ máy chủ ghi – client không sửa được
    if (cur?.data?.data?.otaManual) data.otaManual = cur.data.data.otaManual; else delete data.otaManual;
    if (Number(body.baseVersion || 0) !== curVersion) throw conflictOf(cur);
    const doc = { version: curVersion + 1, updatedAt: Date.now(), updatedBy: user.name || user.username, data };
    try {
      await putJSON(finFile(ws), doc, cur ? { ifMatch: cur.etag } : { create: true });
    } catch (e) {
      if (e instanceof ConflictError) throw conflictOf(await getJSON(finFile(ws), { etag: false }));
      throw e;
    }
    return send(res, 200, { version: doc.version, updatedAt: doc.updatedAt, updatedBy: doc.updatedBy });
  }

  res.setHeader('Allow', 'GET, PUT, POST');
  throw new HttpError(405, 'Method not allowed');
});
