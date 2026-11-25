// Gói dịch vụ của cơ sở (dùng chung app + máy chủ).
// 'trial' (tự đăng ký, 14 ngày) · 'basic' Cơ bản · 'advanced' Nâng cao · 'premium' Cao cấp · 'vip' (cơ sở riêng của chủ, đủ tính năng).
// Cơ sở cũ chưa có gói hoặc gói 'pro' cũ = Cao cấp, không hạn (chủ hệ thống đổi sau).
const INF = Infinity;
export const PLANS = {
  // dùng thử = đủ tính năng như gói Cơ bản (chỉ giới hạn 14 ngày)
  trial: { id: 'trial', name: 'Dùng thử', price: 0, maxRooms: 5, maxLocations: 1, maxMembers: 2, features: ['finance', 'push', 'rates'] },
  basic: { id: 'basic', name: 'Cơ bản', price: 65000, maxRooms: 5, maxLocations: 1, maxMembers: 2, features: ['finance', 'push', 'rates'] },
  advanced: { id: 'advanced', name: 'Nâng cao', price: 129000, maxRooms: 15, maxLocations: INF, maxMembers: 5, features: ['finance', 'push', 'rates'] },
  premium: { id: 'premium', name: 'Cao cấp', price: 199000, maxRooms: 30, maxLocations: INF, maxMembers: 10, features: ['finance', 'push', 'rates'] },
  vip: { id: 'vip', name: 'VIP', price: 0, maxRooms: INF, maxLocations: INF, maxMembers: INF, features: ['finance', 'push', 'rates', 'ota'] },
};
/** Các gói bán (theo thứ tự hiển thị) */
export const PAID = ['basic', 'advanced', 'premium'];
/** Combo trả trước: số tháng + % giảm */
export const COMBOS = [{ months: 1, off: 0 }, { months: 3, off: 5 }, { months: 6, off: 8 }];
/** Giá combo (làm tròn tới nghìn) */
export const comboPrice = (plan, months) => {
  const p = PLANS[plan]?.price || 0;
  const off = COMBOS.find((c) => c.months === months)?.off || 0;
  return Math.round((p * months * (1 - off / 100)) / 1000) * 1000;
};

/** Mã gói của cơ sở (cơ sở cũ / 'pro' -> Cao cấp) */
export const planId = (ws) => (ws?.plan && PLANS[ws.plan] ? ws.plan : 'premium');
export const planOf = (ws) => PLANS[planId(ws)];
export const hasFeature = (ws, f) => planOf(ws).features.includes(f);

/** Tên tính năng (hộp nâng cấp) */
export const PRO_FEATURES = {
  finance: 'Tài chính & doanh thu',
  push: 'Thông báo đẩy',
  rates: 'Bảng giá phòng',
  ota: 'Cập nhật giá tự động từ sàn',
  rooms: 'Thêm phòng',
  locations: 'Thêm địa điểm',
  members: 'Thêm nhân viên',
};

export const isTrial = (ws) => ws?.plan === 'trial';
export const isVip = (ws) => ws?.plan === 'vip';
/** Hạn dùng (ms) của gói: dùng thử theo trialEnds, gói trả phí theo paidUntil (thiếu = không hạn), VIP không hạn */
export const planEnds = (ws) => {
  const id = planId(ws);
  if (id === 'trial') return ws?.trialEnds || null;
  if (id === 'vip') return null;
  return ws?.paidUntil || null;
};
export const planExpired = (ws, now = Date.now()) => { const e = planEnds(ws); return !!e && now > e; };
export const planDaysLeft = (ws, now = Date.now()) => { const e = planEnds(ws); return e ? Math.max(0, Math.ceil((e - now) / 864e5)) : null; };
// tên cũ (dùng thử)
export const trialExpired = (ws, now = Date.now()) => isTrial(ws) && planExpired(ws, now);
export const trialDaysLeft = (ws, now = Date.now()) => (isTrial(ws) ? planDaysLeft(ws, now) : null);
export const TRIAL = { days: 14, ...PLANS.trial };

/** Đếm phòng / địa điểm của dữ liệu cơ sở */
export const countRooms = (locations = []) => locations.reduce((n, l) => n + (l.rooms || []).length, 0);
/**
 * Lỗi vượt giới hạn gói (null nếu hợp lệ). Chỉ chặn khi TĂNG vượt giới hạn so với dữ liệu đang có
 * -> cơ sở cũ đã có sẵn nhiều phòng vẫn sửa được, chỉ không thêm được nữa.
 */
export function limitError(ws, locations = [], prev = null) {
  const p = planOf(ws);
  const nL = locations.length; const nR = countRooms(locations);
  const pL = prev ? prev.length : 0; const pR = prev ? countRooms(prev) : 0;
  if (nL > p.maxLocations && nL > pL) return `Gói ${p.name} tối đa ${p.maxLocations} địa điểm`;
  if (nR > p.maxRooms && nR > pR) return `Gói ${p.name} tối đa ${p.maxRooms} phòng`;
  return null;
}
export const trialLimitError = (locations = []) => limitError({ plan: 'trial' }, locations);

/** SĐT Việt Nam -> dạng 0xxxxxxxxx (null nếu không hợp lệ) */
export function normPhone(v) {
  let s = String(v || '').replace(/[\s.()-]/g, '');
  if (s.startsWith('+84')) s = `0${s.slice(3)}`;
  else if (s.startsWith('84') && s.length >= 11) s = `0${s.slice(2)}`;
  return /^0\d{9,10}$/.test(s) ? s : null;
}
