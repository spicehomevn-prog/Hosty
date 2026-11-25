import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { isTrial, planId, PLANS, planExpired, planDaysLeft, planEnds } from './plan.js';

const KEY = 'hosty:session';
const DATA_PREFIX = 'hosty:data:';
const FIN_PREFIX = 'hosty:fin:';

function loadSession() {
  try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; }
}
function saveSession(s) {
  try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch { /* noop */ }
}
function clearCaches() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(DATA_PREFIX) || k.startsWith(FIN_PREFIX) || k === 'hosty:demo').forEach((k) => localStorage.removeItem(k));
  } catch { /* noop */ }
}

/** Gọi API Hostexa; ném Error có .status và .info (body) khi lỗi */
export async function api(path, { token, method = 'GET', body } = {}) {
  let r;
  try {
    r = await fetch(path, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    const e = new Error('Không kết nối được máy chủ. Kiểm tra mạng và thử lại.');
    e.offline = true;
    throw e;
  }
  let data = {};
  try { data = await r.json(); } catch { /* noop */ }
  if (!r.ok) {
    const e = new Error(data.error || `Lỗi ${r.status}`);
    e.status = r.status;
    e.info = data;
    throw e;
  }
  return data;
}

// admin / member chỉ có 1 cơ sở -> vào thẳng; chủ hệ thống luôn chọn cơ sở
const autoWs = (user, workspaces) => (user?.role !== 'owner' && workspaces.length === 1 ? workspaces[0].id : null);

const Ctx = createContext(null);

/**
 * Phiên làm việc:
 *  - { token, user, workspaces, ws }  đã đăng nhập (ws = cơ sở đang mở)
 *  - { demo: true }                   xem thử với dữ liệu mẫu, không đồng bộ
 */
export function SessionProvider({ children }) {
  const [session, setSession] = useState(loadSession);
  useEffect(() => saveSession(session), [session]);

  const logout = useCallback(() => { clearCaches(); setSession(null); }, []);

  const login = useCallback(async (username, password) => {
    const r = await api('/api/auth', { method: 'POST', body: { action: 'login', username, password } });
    clearCaches();
    setSession({ token: r.token, user: r.user, workspaces: r.workspaces, ws: autoWs(r.user, r.workspaces) });
    return r;
  }, []);

  const refresh = useCallback(async () => {
    if (!session?.token) return;
    try {
      const r = await api('/api/auth', { token: session.token });
      setSession((s) => {
        if (!s?.token) return s;
        const stillThere = r.workspaces.some((w) => w.id === s.ws);
        return { ...s, user: r.user, workspaces: r.workspaces, ws: stillThere ? s.ws : autoWs(r.user, r.workspaces) };
      });
    } catch (e) {
      if (e.status === 401 || e.status === 403) logout();
    }
  }, [session?.token, logout]);

  // Cập nhật thông tin tài khoản / danh sách cơ sở mỗi khi mở app
  useEffect(() => { refresh(); }, [session?.token]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo(() => {
    const workspace = session?.workspaces?.find((w) => w.id === session.ws) || null;
    // gói của cơ sở đang mở: dùng thử -> khoá Tài chính / Thông báo; hết hạn (mọi gói) -> chỉ xem (vai trò 'viewer')
    // xem thử: đủ tính năng như VIP
    const pid = session?.demo ? 'vip' : planId(workspace);
    const P = PLANS[pid];
    const plan = {
      id: pid, name: P.name, trial: isTrial(workspace), vip: pid === 'vip',
      expired: !session?.demo && planExpired(workspace), daysLeft: session?.demo ? null : planDaysLeft(workspace),
      ends: session?.demo ? null : planEnds(workspace), limits: P,
      has: (f) => P.features.includes(f),
    };
    const baseRole = session?.demo ? 'demo' : session?.user?.role || null;
    const role = plan.expired && baseRole !== 'owner' ? 'viewer' : baseRole;
    return {
      session,
      role,
      plan,
      /** tính năng Pro bị khoá ở cơ sở đang mở (finance | push | rates | rooms | locations | members) */
      locked: (f) => (f ? !plan.has(f) : plan.trial),
      user: session?.user || null,
      token: session?.token || null,
      workspace,
      workspaces: session?.workspaces || [],
      login,
      logout,
      refresh,
      startDemo: () => setSession({ demo: true }),
      signup: async (form) => {
        const r = await api('/api/auth', { method: 'POST', body: { action: 'signup', ...form } });
        clearCaches();
        setSession({ token: r.token, user: r.user, workspaces: r.workspaces, ws: autoWs(r.user, r.workspaces) });
        return r;
      },
      selectWs: (ws) => setSession((s) => ({ ...s, ws })),
      setToken: (token) => setSession((s) => ({ ...s, token })),
      setWorkspaces: (workspaces) => setSession((s) => ({ ...s, workspaces })),
      call: (path, opts = {}) => api(path, { ...opts, token: session?.token }).catch((e) => {
        if (e.status === 401) logout();
        throw e;
      }),
    };
  }, [session, login, logout, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);
