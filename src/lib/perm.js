// Phân quyền theo vai trò
// owner  : chủ hệ thống — toàn quyền + quản lý tài khoản
// admin  : admin cơ sở — toàn quyền trên dữ liệu cơ sở
// member : chỉ dọn phòng — xem, tick dọn phòng, tick task được giao, copy thẻ
// demo   : chế độ xem thử trên máy (không đồng bộ)
// viewer : cơ sở dùng thử đã hết hạn – chỉ xem
// Tài chính (can(role, 'finance')): chỉ owner, admin (và xem thử). Máy chủ cũng chặn member ở /api/finance.
const MEMBER = new Set(['view', 'clean.tick', 'task.tick']);

export function can(role, action) {
  if (action === 'accounts') return role === 'owner';
  if (role === 'viewer') return action === 'view';
  if (role === 'owner' || role === 'admin' || role === 'demo') return true;
  return MEMBER.has(action);
}

/** Loại tài khoản thành viên (cùng quyền 'member'): dọn phòng hoặc nhân viên */
export const KINDS = { cleaner: 'Dọn phòng', staff: 'Nhân viên' };
export const kindOf = (a) => (a?.kind === 'staff' ? 'staff' : 'cleaner');
/** Tài khoản Dọn phòng: chỉ thấy màn dọn phòng + việc được giao (không lịch phòng, không giá, không tên khách) */
export const isCleaner = (role, user) => role === 'member' && kindOf(user) === 'cleaner';
/** Nhân viên: xem giá đặt phòng (chỉ đọc) */
export const isStaff = (role, user) => role === 'member' && kindOf(user) === 'staff';
/** Địa điểm được gán ([] = mọi địa điểm) */
export const assignedLocations = (a) => (Array.isArray(a?.locations) ? a.locations : []);

/** Nhãn vai trò hiển thị: thành viên hiện theo loại (Dọn phòng / Nhân viên) */
export const roleLabel = (role, kind) => (role === 'member' ? KINDS[kind === 'staff' ? 'staff' : 'cleaner'] : ROLE_LABEL[role] || role);
export const ROLE_LABEL = { owner: 'Chủ hệ thống', admin: 'Admin cơ sở', member: 'Dọn phòng', demo: 'Xem thử', viewer: 'Chỉ xem' };

/** Task mà tài khoản được thấy: member chỉ thấy task chung + task giao cho mình */
export const visibleTasks = (tasks, role, user) =>
  (role === 'member' ? tasks.filter((t) => !t.assignee || t.assignee === user?.id) : tasks);

/** Có được tick hoàn thành task này không */
export const canTickTask = (task, role, user) =>
  can(role, 'task.create') || (role === 'member' && (!task.assignee || task.assignee === user?.id));
