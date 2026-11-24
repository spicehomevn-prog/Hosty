// Gói của cơ sở: 'pro' (mặc định, gồm mọi cơ sở cũ) hoặc 'trial' (tự đăng ký dùng thử). Dùng chung app + máy chủ.
export const TRIAL = { days: 14, maxRooms: 5, maxLocations: 1, maxMembers: 1 };
/** Tính năng chỉ có ở gói Pro */
export const PRO_FEATURES = {
  finance: 'Tài chính & doanh thu',
  push: 'Thông báo đẩy',
  rates: 'Cập nhật giá phòng',
  rooms: `Hơn ${TRIAL.maxRooms} phòng`,
  locations: `Hơn ${TRIAL.maxLocations} địa điểm`,
  members: `Hơn ${TRIAL.maxMembers} nhân viên`,
};

export const isTrial = (ws) => ws?.plan === 'trial';
export const trialExpired = (ws, now = Date.now()) => isTrial(ws) && !!ws.trialEnds && now > ws.trialEnds;
export const trialDaysLeft = (ws, now = Date.now()) => (isTrial(ws) && ws.trialEnds ? Math.max(0, Math.ceil((ws.trialEnds - now) / 864e5)) : null);

/** Đếm phòng / địa điểm của dữ liệu cơ sở */
export const countRooms = (locations = []) => locations.reduce((n, l) => n + (l.rooms || []).length, 0);
/** Lỗi giới hạn gói dùng thử (null nếu hợp lệ) */
export function trialLimitError(locations = []) {
  if (locations.length > TRIAL.maxLocations) return `Gói dùng thử tối đa ${TRIAL.maxLocations} địa điểm`;
  if (countRooms(locations) > TRIAL.maxRooms) return `Gói dùng thử tối đa ${TRIAL.maxRooms} phòng`;
  return null;
}

/** SĐT Việt Nam -> dạng 0xxxxxxxxx (null nếu không hợp lệ) */
export function normPhone(v) {
  let s = String(v || '').replace(/[\s.()-]/g, '');
  if (s.startsWith('+84')) s = `0${s.slice(3)}`;
  else if (s.startsWith('84') && s.length >= 11) s = `0${s.slice(2)}`;
  return /^0\d{9,10}$/.test(s) ? s : null;
}
