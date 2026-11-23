// Tiền Việt: hiển thị và nhập số tiền
const nf = new Intl.NumberFormat('vi-VN');

/** 1250000 -> "1.250.000 ₫" */
export const fmtVND = (n) => `${nf.format(Math.round(Number(n) || 0))} ₫`;

/** Dạng gọn cho thẻ số / biểu đồ: 1,25tr · 850k · 1,2 tỷ */
export function fmtShort(n) {
  const v = Math.round(Number(n) || 0);
  const a = Math.abs(v);
  const s = v < 0 ? '−' : '';
  const one = (x) => nf.format(Math.round(x * 10) / 10);
  if (a >= 1e9) return `${s}${one(a / 1e9)} tỷ`;
  if (a >= 1e6) return `${s}${one(a / 1e6)}tr`;
  if (a >= 1e3) return `${s}${Math.round(a / 1e3)}k`;
  return `${s}${a}`;
}

/** Chuỗi người dùng nhập ("1.250.000", "1250000", "1,25tr", "850k") -> số; rỗng/không hợp lệ -> null */
export function parseVND(text) {
  const t = String(text ?? '').trim().toLowerCase().replace(/\s|₫|đ|vnd/g, '');
  if (!t) return null;
  const m = t.match(/^(\d+(?:[.,]\d+)?)(tr|triệu|trieu|m|k|nghìn|ngàn|ty|tỷ)$/);
  if (m) {
    const base = Number(m[1].replace(',', '.'));
    const mul = /^(tr|triệu|trieu|m)$/.test(m[2]) ? 1e6 : /^(ty|tỷ)$/.test(m[2]) ? 1e9 : 1e3;
    return Math.round(base * mul);
  }
  const digits = t.replace(/[.,](?=\d{3}(\D|$))/g, '').replace(/[^\d]/g, '');
  return digits ? Number(digits) : null;
}

/** Số có dấu chấm ngăn cách khi đang gõ: "1250000" -> "1.250.000" */
export const groupDigits = (n) => (n == null || n === '' ? '' : nf.format(n));
