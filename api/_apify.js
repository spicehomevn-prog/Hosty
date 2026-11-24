// Lấy giá theo ngày trên các sàn qua actor "Hotel Rates API" (scrapercompany/scrapercompany-hotel-rates) của Apify:
//   Airbnb (/v1/airbnb/calendar), Booking.com (/v1/ota/booking: lịch giá), Agoda (/v1/ota/agoda: từng đêm).
// - Cần biến môi trường APIFY_TOKEN (chỉ dùng ở máy chủ, không bao giờ gửi xuống trình duyệt).
// - Mỗi đêm còn trống được Airbnb báo giá (endpoint /v1/airbnb/calendar, price_nights: 'all').
//   Đêm đã có khách / bị chặn không có giá -> giữ giá lần chụp trước.
// - Chi phí: khoảng $0,0015 mỗi đêm có giá + phí khởi động; 2 tháng ≈ $0,06 mỗi listing mỗi lần chạy.
import { envClean } from './_auth.js';

const ACTOR = 'scrapercompany~scrapercompany-hotel-rates';
const API = 'https://api.apify.com/v2';
export const OTA_MONTHS = 2; // tháng này + tháng sau
export const COST_PER_LISTING = 0.1; // trần chi phí mỗi listing Airbnb mỗi lần chạy (USD)
export const BOOKING_COST = 0.018; // 1 lịch giá Booking.com (2 tháng) / trang
export const AGODA_COST = 0.018; // 1 đêm Agoda
export const AIRBNB_COST = 0.06; // ước tính 1 listing Airbnb / lần (2 tháng)

export class OtaError extends Error {}

export const apifyToken = () => envClean(process.env.APIFY_TOKEN).replace(/^Bearer\s+/i, '');

/** Tình trạng APIFY_TOKEN (không bao giờ trả giá trị) cho /api/health và thông báo lỗi */
export function apifyTokenStatus() {
  const t = apifyToken();
  if (!t) return 'thiếu';
  if (!/^[\x21-\x7E]+$/.test(t)) return 'có ký tự lạ (khoảng trắng, xuống dòng, dấu tiếng Việt…) – dán lại token trên Vercel';
  if (!/^apify_api_/.test(t)) return 'không đúng dạng (token Apify bắt đầu bằng apify_api_)';
  return 'ok';
}

/** Link / mã listing Airbnb -> mã số listing (hoặc null nếu là link rút gọn cần mở ra) */
export function airbnbId(text) {
  const s = String(text || '').trim();
  if (/^\d{5,25}$/.test(s)) return s;
  const m = s.match(/airbnb\.[a-z.]+\/(?:[a-z-]+\/)?rooms\/(?:plus\/)?(\d{5,25})/i);
  return m ? m[1] : null;
}

/** Link rút gọn airbnb.com/h/<tên> -> mã số listing (theo chuyển hướng của Airbnb, chỉ đi tới host Airbnb) */
export async function resolveAirbnb(text) {
  const direct = airbnbId(text);
  if (direct) return direct;
  let url;
  try { url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`); } catch { throw new OtaError('Link Airbnb không hợp lệ'); }
  if (/^airbnb\./i.test(url.hostname)) url.hostname = `www.${url.hostname}`; // airbnb.com -> www.airbnb.com (bớt một lần chuyển hướng)
  for (let hop = 0; hop < 4; hop++) {
    if (!/(^|\.)airbnb\.[a-z.]+$/i.test(url.hostname) || url.protocol !== 'https:') throw new OtaError('Chỉ nhận link Airbnb');
    const id = airbnbId(url.toString());
    if (id) return id;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    let r;
    try {
      r = await fetch(url, { redirect: 'manual', signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Hostexa/1.0)', 'Accept-Language': 'en-US' } });
    } catch { throw new OtaError('Không mở được link Airbnb'); } finally { clearTimeout(t); }
    const loc = r.headers.get('location');
    if (!loc) break;
    url = new URL(loc, url);
  }
  throw new OtaError('Không tìm thấy mã phòng trong link Airbnb (dùng link dạng airbnb.com/rooms/123…)');
}

/** Một dòng kết quả của /v1/airbnb/calendar -> { prices: { 'YYYY-MM-DD': giá VND }, priced, available } */
export function parseAirbnbCalendar(item) {
  const prices = {};
  let available = 0;
  for (const d of item?.days || []) {
    if (d.available) available += 1;
    if (d.price_status !== 'priced' || !d.price) continue;
    // giá khách trả cho 1 đêm (đã trừ giảm giá Airbnb đang chạy, ví dụ "Early booking discount")
    const p = Number(d.price.total ?? d.price.price_per_night);
    if (p > 0) prices[d.date] = Math.round(p);
  }
  return { prices, priced: Object.keys(prices).length, available };
}

/**
 * Gọi actor 1 lần với nhiều request [{ endpoint, body }] -> danh sách kết quả (mỗi request 1 mục, có `input`; lỗi có `error`).
 * maxCharge: trần chi phí của lần chạy (USD).
 */
export async function runBatch(requests, { maxCharge = 0.1, timeout = 240, concurrency = 8 } = {}) {
  const token = apifyToken();
  if (!token) throw new OtaError('Máy chủ chưa có biến APIFY_TOKEN (xem README)');
  const st = apifyTokenStatus();
  if (st !== 'ok') throw new OtaError(`APIFY_TOKEN ${st}`);
  if (!requests.length) return [];
  const body = { requests, includeErrors: true, maxConcurrency: concurrency, maxRetries: 2 };
  const qs = new URLSearchParams({ timeout: String(timeout), maxTotalChargeUsd: String(Math.max(0.02, +maxCharge.toFixed(3))), clean: 'true', format: 'json' });
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), (timeout + 30) * 1000);
  let r;
  try {
    r = await fetch(`${API}/acts/${ACTOR}/run-sync-get-dataset-items?${qs}`, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  } catch (e) {
    if (e.name === 'AbortError') throw new OtaError('Apify chạy quá lâu, thử lại sau');
    // ghi kèm nguyên nhân kỹ thuật (không chứa token) để dễ tìm lỗi
    const why = String(e.cause?.code || e.cause?.message || e.message || '').replace(/apify_api_\w+/g, '***').slice(0, 80);
    console.error('apify fetch', why);
    throw new OtaError(`Không kết nối được Apify${why ? ` (${why})` : ''}`);
  } finally { clearTimeout(t); }
  if (r.status === 401 || r.status === 403) throw new OtaError('APIFY_TOKEN không hợp lệ hoặc hết quyền');
  if (r.status === 402) throw new OtaError('Tài khoản Apify hết hạn mức / chưa thanh toán');
  if (!r.ok && r.status !== 201) throw new OtaError(`Apify trả về lỗi ${r.status}`);
  const items = await r.json().catch(() => []);
  return Array.isArray(items) ? items : [];
}

const vnNow = (now) => new Date(now.getTime() + 7 * 3600e3);
const errText = (e) => String(e).replace(/apify_api_\w+/g, '***').slice(0, 160);

/**
 * Airbnb: chạy actor cho danh sách listing [{ key, id }] -> { [key]: { prices, priced, available } | { error } }
 * Một lần chạy cho mọi listing (batch), chờ kết quả đồng bộ.
 */
export async function runAirbnbCalendars(listings, { now = new Date(), months = OTA_MONTHS } = {}) {
  if (!listings.length) return {};
  const vn = vnNow(now);
  const items = await runBatch(listings.map((l) => ({
    endpoint: '/v1/airbnb/calendar',
    body: { listing_id: l.id, currency: 'VND', months, start_month: vn.getUTCMonth() + 1, start_year: vn.getUTCFullYear(), price_nights: 'all', max_price_quotes: 62 },
  })), { maxCharge: COST_PER_LISTING * listings.length, concurrency: 3 });
  const out = {};
  for (const l of listings) {
    const it = items.find((x) => String(x.listing_id || x.input?.listing_id) === String(l.id));
    if (!it) out[l.key] = { error: 'Apify không trả kết quả cho listing này' };
    else if (it.error) out[l.key] = { error: errText(it.error) };
    else out[l.key] = parseAirbnbCalendar(it);
  }
  return out;
}

/* ---------- Booking.com: lịch giá theo ngày của 1 trang khách sạn ---------- */

/** Link trang Booking.com -> { country, pagename } (hoặc null) */
export function bookingPage(text) {
  const s = String(text || '').trim();
  const m = s.match(/booking\.com\/hotel\/([a-z]{2})\/([a-z0-9][a-z0-9-]*?)(?:\.[a-z]{2}(?:-[a-z]{2})?)?\.html/i);
  return m ? { country: m[1].toLowerCase(), pagename: m[2].toLowerCase() } : null;
}

/** Link rút gọn / link Booking.com -> { country, pagename } (theo chuyển hướng, chỉ đi tới host Booking.com) */
export async function resolveBooking(text) {
  const direct = bookingPage(text);
  if (direct) return direct;
  let url;
  try { url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`); } catch { throw new OtaError('Link Booking.com không hợp lệ'); }
  for (let hop = 0; hop < 4; hop++) {
    if (!/(^|\.)booking\.com$/i.test(url.hostname) || url.protocol !== 'https:') throw new OtaError('Chỉ nhận link Booking.com');
    const p = bookingPage(url.toString());
    if (p) return p;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    let r;
    try {
      r = await fetch(url, { redirect: 'manual', signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Hostexa/1.0)', 'Accept-Language': 'en-US' } });
    } catch { throw new OtaError('Không mở được link Booking.com'); } finally { clearTimeout(t); }
    const loc = r.headers.get('location');
    if (!loc) break;
    url = new URL(loc, url);
  }
  throw new OtaError('Không đọc được link Booking.com (dùng link dạng booking.com/hotel/vn/ten-cho-o.html)');
}

/** Một kết quả /v1/ota/booking -> { prices, priced, available } (giá thấp nhất của trang cho từng đêm) */
export function parseBookingCalendar(item) {
  const prices = {};
  let available = 0;
  for (const d of item?.calendar || []) {
    if (d.available) available += 1;
    if (!d.available || d.is_soldout || !d.stay_date) continue;
    const p = Number(d.price);
    if (p > 0 && (!d.currency || d.currency === 'VND')) prices[d.stay_date] = Math.round(p);
  }
  return { prices, priced: Object.keys(prices).length, available };
}

/** Trang [{ key, country, pagename }] -> { [key]: { prices, priced, available } | { error } } – từ ngày 1 tháng này, `months` tháng */
export async function runBookingCalendars(pages, { now = new Date(), months = OTA_MONTHS } = {}) {
  if (!pages.length) return {};
  const vn = vnNow(now);
  const start = new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), 1));
  const end = new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth() + months, 1));
  const days = Math.round((end - start) / 864e5);
  const items = await runBatch(pages.map((p) => ({
    endpoint: '/v1/ota/booking',
    body: { pagename: p.pagename, country: p.country, start: start.toISOString().slice(0, 10), days, currency: 'VND', adults: 2, rooms: 1 },
  })), { maxCharge: BOOKING_COST * 1.5 * pages.length, concurrency: 4 });
  const out = {};
  for (const p of pages) {
    const it = items.find((x) => (x.input?.pagename || x.property?.pagename) === p.pagename && (!x.input?.country || x.input.country === p.country));
    if (!it) out[p.key] = { error: 'Apify không trả kết quả cho trang này' };
    else if (it.error) out[p.key] = { error: errText(it.error) };
    else out[p.key] = parseBookingCalendar(it);
  }
  return out;
}

/* ---------- Agoda: giá từng đêm (1 đêm = 1 request), theo USD rồi quy đổi VND ---------- */

/** Mã cơ sở Agoda từ số / link (...-h8795952.html, ?hotelId=8795952) */
export function agodaId(text) {
  const s = String(text || '').trim();
  if (/^\d{3,12}$/.test(s)) return s;
  const m = s.match(/[?&](?:hotel_?id|hid)=(\d{3,12})/i) || s.match(/-h(\d{3,12})(?:\.html|[/?#]|$)/i);
  return m ? m[1] : null;
}

const fold = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Một kết quả /v1/ota/agoda (1 đêm) -> { price (USD) | null, roomTypes: [tên] }
 * roomName: loại phòng trên Agoda của phòng này (giá thấp nhất trong các loại khớp tên); trống = giá thấp nhất của cơ sở.
 */
export function parseAgodaNight(item, roomName = '') {
  const p = item?.property || {};
  const rooms = Array.isArray(p.rooms) ? p.rooms : [];
  const roomTypes = [...new Set(rooms.map((r) => String(r.name || '').trim()).filter(Boolean))];
  if (p.sold_out || p.is_soldout) return { price: null, roomTypes, currency: p.currency };
  let price = null;
  if (roomName) {
    const want = fold(roomName);
    const hits = rooms.filter((r) => fold(r.name) === want);
    const offers = (hits.length ? hits : rooms.filter((r) => fold(r.name).includes(want))).flatMap((r) => r.offers || []);
    const ps = offers.map((o) => Number(o.price)).filter((v) => v > 0);
    price = ps.length ? Math.min(...ps) : null;
  } else {
    price = Number(p.price_per_night) || null;
  }
  return { price, roomTypes, currency: p.currency || 'USD' };
}

/**
 * Agoda: [{ key, id, nights: [ngày] }] -> { [key]: { items: { [ngày]: kết quả actor } } | { error } }
 * (chọn loại phòng / quy đổi tiền làm ở finance.js vì nhiều phòng có thể dùng chung 1 cơ sở Agoda)
 */
export async function runAgodaNights(props) {
  const reqs = props.flatMap((p) => p.nights.map((d) => ({ endpoint: '/v1/ota/agoda', body: { property_id: p.id, check_in: d, nights: 1, currency: 'USD', adults: 2, rooms: 1 } })));
  if (!reqs.length) return {};
  const items = await runBatch(reqs, { maxCharge: AGODA_COST * 1.2 * reqs.length, concurrency: 8 });
  const out = {};
  for (const p of props) {
    const mine = items.filter((x) => String(x.input?.property_id || x.property?.property_id) === String(p.id));
    const ok = mine.filter((x) => !x.error);
    if (!ok.length) { out[p.key] = { error: errText(mine[0]?.error || 'Apify không trả kết quả cho cơ sở này') }; continue; }
    out[p.key] = { items: Object.fromEntries(ok.map((x) => [x.input?.check_in || x.search_parameters?.check_in_date, x]).filter(([d]) => d)) };
  }
  return out;
}

/** Tỷ giá USD -> VND (nguồn công khai, không cần khoá); lỗi thì null để dùng tỷ giá trong cài đặt */
export async function usdVnd() {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch('https://open.er-api.com/v6/latest/USD', { signal: ctrl.signal });
    const v = Number((await r.json())?.rates?.VND);
    return v > 1000 && v < 100000 ? Math.round(v) : null;
  } catch { return null; } finally { clearTimeout(t); }
}
