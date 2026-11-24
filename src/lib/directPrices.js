// Nhập giá đặt phòng kênh Trực tiếp bằng file Excel:
// 1. tải form mẫu của tháng (mỗi đặt phòng trực tiếp 1 dòng, điền sẵn giá đang có);
// 2. khách điền / sửa giá trong Excel;
// 3. tải lên lại -> tự điền giá vào từng đặt phòng (ghép theo cột "Mã", không đụng sàn khác).
import { applyDiscount, extrasTotal } from './fin.js';
import { diffDays } from './dates.js';

export const DIRECT = 'Trực tiếp';
const COLS = [
  { k: 'id', h: 'Mã (không sửa)', w: 14 },
  { k: 'room', h: 'Phòng', w: 20 },
  { k: 'guest', h: 'Khách', w: 26 },
  { k: 'start', h: 'Nhận phòng', w: 13 },
  { k: 'end', h: 'Trả phòng', w: 13 },
  { k: 'nights', h: 'Số đêm', w: 8 },
  { k: 'base', h: 'Giá phòng (₫, trước giảm)', w: 22, money: true, input: true },
  { k: 'discount', h: 'Giảm giá (₫)', w: 14, money: true, input: true },
  { k: 'extras', h: 'Dịch vụ thêm (₫)', w: 16, money: true, input: true },
  { k: 'deposit', h: 'Đã cọc (₫)', w: 14, money: true, input: true },
  { k: 'paid', h: 'Đã thu đủ (gõ x)', w: 15, input: true },
];
const monthEnd = (m) => { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };
const dmy = (k) => `${k.slice(8)}/${k.slice(5, 7)}/${k.slice(0, 4)}`;

/** Đặt phòng trực tiếp có đêm ở trong tháng m ("YYYY-MM") + giá đang có */
export function directRows(bookings, fin, m, rooms = {}) {
  const a = `${m}-01`; const z = monthEnd(m);
  return bookings
    .filter((b) => b.source === 'manual' && (b.platform || DIRECT) === DIRECT && b.start < z && b.end > a)
    .sort((x, y) => (x.start < y.start ? -1 : x.start > y.start ? 1 : 0))
    .map((b) => {
      const e = fin.prices?.[b.id] || {};
      const base = e.base ?? e.amount ?? null;
      return {
        id: b.id, room: rooms[b.roomId] || '', guest: b.guest || '', start: b.start, end: b.end, nights: diffDays(b.start, b.end),
        base, discount: base != null && e.amount != null ? Math.max(0, base - e.amount) : null,
        extras: extrasTotal(e) || null, deposit: Number(e.deposit) || null, paid: e.paidAt ? 'x' : '',
      };
    });
}

/** Tải form Excel mẫu của tháng (mở bằng Excel / Google Sheets / Numbers) */
export async function downloadTemplate(rows, m, wsName = '') {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const head = COLS.map((c) => ({ value: c.h, fontWeight: 'bold', color: '#FFFFFF', backgroundColor: c.input ? '#7C5CE6' : '#241A3B', wrap: true }));
  const body = rows.map((r) => COLS.map((c) => {
    let v = r[c.k];
    if (c.k === 'start' || c.k === 'end') v = dmy(v);
    if (v == null || v === '') return c.input ? { value: null, backgroundColor: '#F6F2FF' } : null;
    if (c.money || c.k === 'nights') return { value: Number(v), type: Number, format: '#,##0', ...(c.input ? { backgroundColor: '#F6F2FF' } : {}) };
    return { value: String(v), type: String, ...(c.input ? { backgroundColor: '#F6F2FF' } : {}) };
  }));
  const [y, mo] = m.split('-');
  const guide = [
    [{ value: `Giá đặt phòng trực tiếp – tháng ${mo}/${y}${wsName ? ` – ${wsName}` : ''}`, fontWeight: 'bold', fontSize: 14 }],
    [{ value: 'Cách dùng:', fontWeight: 'bold' }],
    [{ value: '1. Ở trang "Giá", điền các cột màu tím: Giá phòng, Giảm giá, Dịch vụ thêm, Đã cọc, Đã thu đủ (gõ x).' }],
    [{ value: '2. KHÔNG sửa cột "Mã" – Hostexa dùng cột này để biết dòng nào là đặt phòng nào.' }],
    [{ value: '3. Lưu file (giữ dạng .xlsx), rồi vào Hostexa → Tài chính → Nhập file → Trực tiếp → tải lên.' }],
    [{ value: '4. Ô để trống = giữ nguyên giá đang có trong Hostexa.' }],
  ];
  const fileName = `hostexa-gia-truc-tiep-${y}-${mo}.xlsx`;
  await writeXlsxFile(
    [
      { data: [head, ...body], sheet: 'Giá', columns: COLS.map((c) => ({ width: c.w })), stickyRowsCount: 1 },
      { data: guide, sheet: 'Hướng dẫn', columns: [{ width: 100 }] },
    ],
  ).toFile(fileName);
  return fileName;
}

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();
const num = (v) => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Math.round(v);
  const s = String(v).replace(/[^\d,.-]/g, '').replace(/[.,](?=\d{3}(\D|$))/g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : NaN;
};

/** Đọc bảng (mảng 2 chiều) từ file khách tải lên -> [{ id, base, discount, extras, deposit, paid, row }] */
export function parseDirect(rows) {
  const hi = rows.findIndex((r) => r.some((c) => norm(c).startsWith('ma')) && r.some((c) => norm(c).startsWith('gia phong')));
  if (hi < 0) throw new Error('Không thấy dòng tiêu đề của form mẫu (cột "Mã" và "Giá phòng"). Hãy dùng đúng form tải từ Hostexa.');
  const heads = rows[hi].map(norm);
  const col = (p) => heads.findIndex((h) => h.startsWith(p));
  const ix = { id: col('ma'), base: col('gia phong'), discount: col('giam gia'), extras: col('dich vu'), deposit: col('da coc'), paid: col('da thu du') };
  const out = [];
  rows.slice(hi + 1).forEach((r, i) => {
    const id = String(r[ix.id] ?? '').trim();
    if (!id) return;
    const g = (k) => (ix[k] >= 0 ? r[ix[k]] : null);
    out.push({
      id, row: hi + i + 2,
      base: num(g('base')), discount: num(g('discount')), extras: num(g('extras')), deposit: num(g('deposit')),
      paid: ix.paid >= 0 ? /^(x|có|co|rồi|roi|yes|1|true|✓|v)$/i.test(String(g('paid') ?? '').trim()) : null,
      paidBlank: ix.paid >= 0 && String(g('paid') ?? '').trim() === '',
    });
  });
  return out;
}

/**
 * Ghép dòng file với đặt phòng trực tiếp -> { entries (cho PRICES), items, summary }.
 * Chỉ ghi vào mục giá của đặt phòng TRỰC TIẾP (source manual, kênh Trực tiếp) có đúng "Mã" – không đụng sàn khác.
 */
export function planDirect(parsed, bookings, prices = {}, by = '') {
  const direct = new Map(bookings.filter((b) => b.source === 'manual' && (b.platform || DIRECT) === DIRECT).map((b) => [b.id, b]));
  const entries = {}; const items = [];
  const sum = { updated: 0, unchanged: 0, notFound: 0, invalid: 0 };
  for (const p of parsed) {
    const b = direct.get(p.id);
    if (!b) { sum.notFound += 1; items.push({ ...p, status: 'notFound' }); continue; }
    if ([p.base, p.discount, p.extras, p.deposit].some((v) => Number.isNaN(v) || (v != null && v < 0))) {
      sum.invalid += 1; items.push({ ...p, b, status: 'invalid', why: 'Số tiền không hợp lệ' }); continue;
    }
    const old = prices[p.id] || {};
    const oldBase = old.base ?? old.amount ?? null;
    const base = p.base ?? oldBase;
    if (base == null) { sum.invalid += 1; items.push({ ...p, b, status: 'invalid', why: 'Chưa có giá phòng' }); continue; }
    const oldDisc = oldBase != null && old.amount != null ? Math.max(0, oldBase - old.amount) : 0;
    const discAmt = p.discount ?? oldDisc;
    if (discAmt > base) { sum.invalid += 1; items.push({ ...p, b, status: 'invalid', why: 'Giảm giá lớn hơn giá phòng' }); continue; }
    // giữ kiểu giảm cũ (ví dụ %) nếu số tiền giảm không đổi
    const discount = discAmt > 0 ? (old.discount && discAmt === oldDisc ? old.discount : { type: 'amount', value: discAmt }) : null;
    const amount = discount ? applyDiscount(base, discount) : base;
    const oldEx = extrasTotal(old);
    const exTotal = p.extras ?? oldEx;
    const extras = exTotal > 0 ? (exTotal === oldEx && old.extras?.length ? old.extras : [{ id: `x${p.id}`, name: 'Dịch vụ cộng thêm', price: exTotal, qty: 1 }]) : null;
    const deposit = p.deposit ?? (Number(old.deposit) || 0);
    // cột 'Đã thu đủ': x = đã thu (giữ ngày cũ nếu có), trống = chưa thu; file không có cột này -> giữ nguyên
    const paidAt = p.paid == null ? old.paidAt || null : p.paid ? old.paidAt || Date.now() : null;
    const { base: _b, discount: _d, extras: _x, deposit: _p, paidAt: _pa, ...rest } = old; // eslint-disable-line no-unused-vars
    const entry = {
      ...rest, roomId: b.roomId, platform: DIRECT, guest: b.guest || old.guest || '', start: b.start, end: b.end, amount,
      ...(discount ? { base, discount } : {}), ...(extras ? { extras } : {}), ...(deposit > 0 ? { deposit } : {}),
      ...(paidAt ? { paidAt } : {}), source: 'manual', at: Date.now(), by,
    };
    // so phần tiền (không tính thứ tự khoá, thời điểm, người sửa)
    const money = (e) => JSON.stringify([e.amount ?? null, e.base ?? e.amount ?? null, extrasTotal(e), Number(e.deposit) || 0, !!e.paidAt, e.roomId, e.start, e.end]);
    const same = money(entry) === money(old);
    if (same) { sum.unchanged += 1; items.push({ ...p, b, status: 'same', entry }); continue; }
    entries[p.id] = entry;
    sum.updated += 1;
    items.push({ ...p, b, status: 'update', entry, oldTotal: old.amount != null ? old.amount + oldEx : null, newTotal: amount + (extras ? exTotal : 0) });
  }
  return { entries, items, summary: sum };
}
