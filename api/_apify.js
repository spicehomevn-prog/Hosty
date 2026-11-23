// Lấy giá theo ngày trên Airbnb qua actor "Hotel Rates API" (scrapercompany/scrapercompany-hotel-rates) của Apify.
// - Cần biến môi trường APIFY_TOKEN (chỉ dùng ở máy chủ, không bao giờ gửi xuống trình duyệt).
// - Mỗi đêm còn trống được Airbnb báo giá (endpoint /v1/airbnb/calendar, price_nights: 'all').
//   Đêm đã có khách / bị chặn không có giá -> giữ giá lần chụp trước.
// - Chi phí: khoảng $0,0015 mỗi đêm có giá + phí khởi động; 2 tháng ≈ $0,06 mỗi listing mỗi lần chạy.
import { envClean } from './_auth.js';

const ACTOR = 'scrapercompany~scrapercompany-hotel-rates';
const API = 'https://api.apify.com/v2';
export const OTA_MONTHS = 2; // tháng này + tháng sau
export const COST_PER_LISTING = 0.1; // trần chi phí mỗi listing mỗi lần chạy (USD)

export class OtaError extends Error {}

export const apifyToken = () => envClean(process.env.APIFY_TOKEN);

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
 * Chạy actor cho danh sách listing [{ key, id }] -> { [key]: { prices, priced, available } | { error } }
 * Một lần chạy cho mọi listing (batch), chờ kết quả đồng bộ.
 */
export async function runAirbnbCalendars(listings, { now = new Date(), months = OTA_MONTHS } = {}) {
  const token = apifyToken();
  if (!token) throw new OtaError('Máy chủ chưa có biến APIFY_TOKEN (xem README)');
  if (!listings.length) return {};
  const vn = new Date(now.getTime() + 7 * 3600e3);
  const body = {
    requests: listings.map((l) => ({
      endpoint: '/v1/airbnb/calendar',
      body: { listing_id: l.id, currency: 'VND', months, start_month: vn.getUTCMonth() + 1, start_year: vn.getUTCFullYear(), price_nights: 'all', max_price_quotes: 62 },
    })),
    includeErrors: true, maxConcurrency: 3, maxRetries: 2,
  };
  const qs = new URLSearchParams({ timeout: '240', maxTotalChargeUsd: String(COST_PER_LISTING * listings.length), clean: 'true', format: 'json' });
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 270000);
  let r;
  try {
    r = await fetch(`${API}/acts/${ACTOR}/run-sync-get-dataset-items?${qs}`, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new OtaError(e.name === 'AbortError' ? 'Apify chạy quá lâu, thử lại sau' : 'Không kết nối được Apify');
  } finally { clearTimeout(t); }
  if (r.status === 401 || r.status === 403) throw new OtaError('APIFY_TOKEN không hợp lệ hoặc hết quyền');
  if (r.status === 402) throw new OtaError('Tài khoản Apify hết hạn mức / chưa thanh toán');
  if (!r.ok && r.status !== 201) throw new OtaError(`Apify trả về lỗi ${r.status}`);
  const items = await r.json().catch(() => []);
  const out = {};
  for (const l of listings) {
    const it = (Array.isArray(items) ? items : []).find((x) => String(x.listing_id || x.input?.listing_id) === String(l.id));
    if (!it) out[l.key] = { error: 'Apify không trả kết quả cho listing này' };
    else if (it.error) out[l.key] = { error: String(it.error).slice(0, 160) };
    else out[l.key] = parseAirbnbCalendar(it);
  }
  return out;
}
