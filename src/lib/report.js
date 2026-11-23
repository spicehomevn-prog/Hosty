// Đọc file báo cáo do sàn xuất ra (CSV / XLSX): Airbnb (thu nhập / giao dịch), Booking.com (danh sách đặt phòng), Agoda YCS.
// Tự nhận cột theo tên tiêu đề (tiếng Anh / tiếng Việt); người dùng sửa lại được ở bước xem trước.
import { addDays } from './dates.js';

export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim();

export const FIELD_LABEL = {
  checkin: 'Ngày nhận', checkout: 'Ngày trả', nights: 'Số đêm', amount: 'Giá phòng', fee: 'Phí sàn / hoa hồng',
  code: 'Mã đặt phòng', guest: 'Tên khách', listing: 'Listing / loại phòng', status: 'Trạng thái', currency: 'Tiền tệ', type: 'Loại dòng',
};
// thứ tự ưu tiên: mẫu đứng trước được chọn trước
const FIELDS = {
  code: [/^confirmation code$/, /^book(ing)? ?(number|no\.?|id)$/, /^reservation (id|number|code)$/, /^ma dat( phong)?$/, /confirmation code|booking id|book number|ma dat/],
  checkin: [/^start date$/, /^check-?in( date)?$/, /^arrival( date)?$/, /ngay (den|nhan)/, /nhan phong/, /check-?in|start date|arrival/],
  checkout: [/^end date$/, /^check-?out( date)?$/, /^departure( date)?$/, /ngay (di|tra)/, /tra phong/, /check-?out|end date|departure/],
  nights: [/^nights$/, /^(duration|length of stay)/, /so dem/, /\bnights?\b/],
  guest: [/^guest( name)?(\(s\))?$/, /^guest name/, /^customer( name)?$/, /^booked by$/, /ten khach|khach hang/, /guest|customer/],
  listing: [/^listing$/, /^unit type$/, /^room type$/, /^room( name)?$/, /loai phong/, /^phong$/, /listing|room type|unit/],
  amount: [/^gross earnings$/, /^price$/, /^total( price| amount)?$/, /^selling (rate|price)$/, /^amount$/, /tong tien|doanh thu|thanh tien|^gia( phong)?$/, /revenue|price|total|amount/],
  fee: [/^commission amount$/, /^service fee$/, /^host (service )?fee$/, /^commission$/, /hoa hong/, /phi (san|dich vu)/, /commission|service fee/],
  status: [/^status$/, /^trang thai$/, /status|trang thai/],
  currency: [/^currency$/, /^tien te$/],
  type: [/^type$/, /^loai( giao dich)?$/],
};

/* ---------- đọc file ---------- */
function parseCSV(text) {
  const t = text.replace(/^﻿/, '');
  const first = t.split(/\r?\n/, 1)[0] || '';
  const delim = [',', ';', '\t'].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((v) => String(v).trim()));
}

export async function readRows(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xls')) throw new Error('File .xls (Excel cũ) chưa đọc được: mở bằng Excel hoặc Google Sheets rồi lưu lại dạng .xlsx hoặc .csv');
  if (name.endsWith('.xlsx')) {
    const { readSheet } = await import('read-excel-file/browser');
    return (await readSheet(file)).map((r) => r.map((v) => (v == null ? '' : v)));
  }
  return parseCSV(await file.text());
}

/* ---------- nhận cột ---------- */
export function detect(rows) {
  let best = { score: 0, header: 0, map: {} };
  for (let h = 0; h < Math.min(rows.length, 15); h++) {
    const heads = rows[h].map(norm);
    const used = new Set(); const map = {};
    for (const [f, pats] of Object.entries(FIELDS)) {
      for (const p of pats) {
        const i = heads.findIndex((x, j) => !used.has(j) && x && p.test(x) && !((f === 'amount' || f === 'fee') && x.includes('%')));
        if (i >= 0) { map[f] = i; used.add(i); break; }
      }
    }
    const score = Object.keys(map).length + (map.checkin != null ? 2 : 0) + (map.amount != null ? 2 : 0);
    if (score > best.score) best = { score, header: h, map };
  }
  return best;
}

/* ---------- giá trị ---------- */
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const ymd = (y, m, d) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y < 100 ? 2000 + y : y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null);

/** Thứ tự ngày của cột: 'dmy' hoặc 'mdy' (nhìn các giá trị có số > 12) */
export function dateOrder(values, fallback = 'dmy') {
  for (const v of values) {
    const m = String(v).match(/^(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}/);
    if (!m) continue;
    if (+m[1] > 12) return 'dmy';
    if (+m[2] > 12) return 'mdy';
  }
  return fallback;
}

export function toDate(v, order = 'dmy') {
  if (v instanceof Date) return Number.isNaN(+v) ? null : ymd(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  if (typeof v === 'number' && v > 20000 && v < 80000) { const d = new Date(Date.UTC(1899, 11, 30) + v * 864e5); return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); }
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return ymd(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) return order === 'mdy' ? ymd(+m[3], +m[1], +m[2]) : ymd(+m[3], +m[2], +m[1]);
  m = norm(s).match(/^(\d{1,2}) ([a-z]{3})[a-z]* (\d{4})/);
  if (m && MONTHS[m[2]]) return ymd(+m[3], MONTHS[m[2]], +m[1]);
  m = norm(s).match(/^([a-z]{3})[a-z]* (\d{1,2}),? (\d{4})/);
  if (m && MONTHS[m[1]]) return ymd(+m[3], MONTHS[m[1]], +m[2]);
  return null;
}

/** "1,250,000 VND" / "₫1.250.000" / "45.50" / 1250000 -> { n, cur } */
export function toMoney(v) {
  if (typeof v === 'number') return { n: v, cur: null };
  const s = String(v ?? '').trim();
  if (!s) return { n: null, cur: null };
  const cur = /usd|us\$|\$/i.test(s) ? 'USD' : /eur|€/i.test(s) ? 'EUR' : /vnd|₫|đ/i.test(s) ? 'VND' : null;
  let t = s.replace(/[^\d.,-]/g, '');
  if (!/\d/.test(t)) return { n: null, cur };
  const lastDot = t.lastIndexOf('.'); const lastComma = t.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = lastDot > lastComma ? '.' : ',';
    t = t.split(dec === '.' ? ',' : '.').join('').replace(dec, '.');
  } else {
    const sep = lastDot >= 0 ? '.' : lastComma >= 0 ? ',' : null;
    if (sep) {
      const parts = t.split(sep);
      const thousands = parts.length > 2 || parts[parts.length - 1].length === 3;
      t = thousands ? parts.join('') : parts.join('.');
    }
  }
  const n = Number(t);
  return { n: Number.isFinite(n) ? n : null, cur };
}

/**
 * Chuyển các dòng thành đặt phòng: [{ code, start, end, nights, guest, listing, amount, fee, cur }]
 * và đếm số dòng bỏ qua (đã huỷ, không phải đặt phòng, thiếu ngày / giá).
 */
export function toBookings(rows, { header, map }, platform) {
  const body = rows.slice(header + 1);
  const col = (r, f) => (map[f] != null ? r[map[f]] : '');
  const fb = platform === 'Airbnb' ? 'mdy' : 'dmy';
  const order = dateOrder([...body.map((r) => col(r, 'checkin')), ...body.map((r) => col(r, 'checkout'))], fb);
  const out = []; const skipped = { cancelled: 0, other: 0, invalid: 0 };
  for (const r of body) {
    const type = norm(col(r, 'type'));
    if (map.type != null && type && !/reservation|dat phong|booking/.test(type)) { skipped.other += 1; continue; }
    if (/cancel|huy/.test(norm(col(r, 'status')))) { skipped.cancelled += 1; continue; }
    const start = toDate(col(r, 'checkin'), order);
    let end = toDate(col(r, 'checkout'), order);
    const nights = Number(String(col(r, 'nights')).replace(/[^\d]/g, '')) || null;
    if (!end && start && nights) end = addDays(start, nights);
    const a = toMoney(col(r, 'amount'));
    const f = toMoney(col(r, 'fee'));
    const curCol = String(col(r, 'currency') || '').trim().toUpperCase();
    if (!start || !end || end <= start || !a.n || a.n <= 0) { skipped.invalid += 1; continue; }
    out.push({
      code: String(col(r, 'code') || '').trim(), start, end, guest: String(col(r, 'guest') || '').trim(),
      listing: String(col(r, 'listing') || '').trim(), amount: a.n, fee: f.n != null ? Math.abs(f.n) : null,
      cur: curCol || a.cur || 'VND',
    });
  }
  return { bookings: out, skipped, order };
}

/** Gợi ý phòng cho một tên listing theo tên phòng */
export function guessRoom(listing, rooms) {
  const l = norm(listing);
  if (!l) return '';
  const hit = rooms.find((r) => { const n = norm(r.name); return n && (l.includes(n) || n.includes(l)); });
  return hit ? hit.id : '';
}
