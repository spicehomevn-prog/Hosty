// Tài khoản & phiên đăng nhập của Hostexa
// - Chủ hệ thống (owner): khai báo bằng biến môi trường HOSTY_OWNER_USERNAME / HOSTY_OWNER_PASSWORD.
// - Tài khoản cơ sở (admin / member): lưu trong hosty/accounts.json, do owner tạo.
import { scrypt as _scrypt, randomBytes, createHmac, createHash, timingSafeEqual, randomInt } from 'node:crypto';
import { promisify } from 'node:util';
import { getJSON, updateJSON } from './_store.js';
import { normPhone, hasFeature, planExpired, planOf, PRO_FEATURES } from '../src/lib/plan.js';
import { HttpError } from './_http.js';

const scrypt = promisify(_scrypt);
const TOKEN_DAYS = 30;

export const ACCOUNTS = 'accounts.json';
export const WORKSPACES = 'workspaces.json';
export const wsFile = (id) => `ws/${id}.json`;

// Bỏ khoảng trắng / dấu ngoặc kép thừa khi dán giá trị vào Vercel
export const envClean = (v) => String(v ?? '').trim().replace(/^(['"])(.*)\1$/, '$2');

function secret() {
  const s = envClean(process.env.AUTH_SECRET);
  if (!s || s.length < 16) throw new HttpError(503, 'Máy chủ thiếu biến AUTH_SECRET (ít nhất 16 ký tự). Xem README.');
  return s;
}
function owner() {
  const username = envClean(process.env.HOSTY_OWNER_USERNAME).toLowerCase();
  const password = envClean(process.env.HOSTY_OWNER_PASSWORD);
  if (!username || !password) return null;
  return { username, password, tv: createHash('sha256').update(password).digest('hex').slice(0, 10) };
}

/* ---------- Mật khẩu ---------- */
export async function hashPassword(pw) {
  const salt = randomBytes(16).toString('hex');
  const hash = (await scrypt(pw, salt, 64)).toString('hex');
  return { salt, passHash: hash };
}
async function checkPassword(pw, salt, passHash) {
  const h = await scrypt(pw, salt, 64);
  const want = Buffer.from(passHash, 'hex');
  return want.length === h.length && timingSafeEqual(h, want);
}
const safeEqual = (a, b) => {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Mật khẩu ngẫu nhiên dễ đọc, ví dụ "mây-7K4P-92XQ" -> "hosty-7K4P-92XQ" */
export function randomPassword() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const part = () => Array.from({ length: 4 }, () => A[randomInt(A.length)]).join('');
  return `${part()}-${part()}-${part()}`;
}

/** Tên cơ sở -> slug không dấu cho tên đăng nhập */
export function slugify(name) {
  return String(name || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd')
    .toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 24) || 'coso';
}
export const validUsername = (u) => /^[a-z0-9][a-z0-9._-]{2,40}$/.test(u);

/* ---------- Token ---------- */
const b64 = (s) => Buffer.from(s).toString('base64url');
function sign(payload) {
  const body = b64(JSON.stringify(payload));
  const sig = createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function verify(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const want = createHmac('sha256', secret()).update(body).digest('base64url');
  if (!safeEqual(sig, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return p.exp > Date.now() ? p : null;
  } catch { return null; }
}

/* ---------- Dữ liệu tài khoản ---------- */
// Đọc danh sách tài khoản / cơ sở: mặc định dùng bản nhớ tạm (≤ 30s trong instance + cache CDN ≤ 60s) để
// mỗi request không tốn thêm thao tác Blob. { fresh: true } = đọc bản mới nhất (đăng nhập, khi bản nhớ tạm không khớp).
const LIST_MEMO = 30 * 1000;
const readList = (name, fresh) => getJSON(name, fresh ? { etag: false } : { etag: false, cache: true, memo: LIST_MEMO });
export async function loadAccounts({ fresh = false } = {}) {
  const r = await readList(ACCOUNTS, fresh);
  return r ? r.data : { accounts: [] };
}
export async function loadWorkspaces({ fresh = false } = {}) {
  const r = await readList(WORKSPACES, fresh);
  return r ? r.data : { workspaces: [] };
}

/** Thông tin cơ sở (bản nhớ tạm trước, không thấy thì đọc lại bản mới); null nếu không còn */
export async function getWorkspace(ws) {
  return (await loadWorkspaces()).workspaces.find((w) => w.id === ws)
    || (await loadWorkspaces({ fresh: true })).workspaces.find((w) => w.id === ws) || null;
}
export const wsExists = async (ws) => !!(await getWorkspace(ws));
/** Chặn tính năng không có trong gói của cơ sở (hoặc gói đã hết hạn) */
export async function requireFeature(ws, feature) {
  let w = await getWorkspace(ws);
  if (!w) throw new HttpError(404, 'Cơ sở không còn tồn tại');
  const label = PRO_FEATURES[feature] || 'Tính năng này';
  // sắp từ chối -> đọc lại bản mới nhất (chủ hệ thống vừa đổi gói thì bản nhớ tạm có thể còn cũ tới ~90 giây)
  if (!hasFeature(w, feature) || planExpired(w)) w = (await loadWorkspaces({ fresh: true })).workspaces.find((x) => x.id === ws) || w;
  if (!hasFeature(w, feature)) {
    throw new HttpError(403, feature === 'ota'
      ? `${label} chỉ có ở tài khoản VIP`
      : `${label} không có ở gói ${planOf(w).name} – nâng cấp gói trả phí để kích hoạt`, { pro: true });
  }
  if (planExpired(w)) throw new HttpError(403, `Gói ${planOf(w).name} đã hết hạn – gia hạn để tiếp tục`, { expired: true });
  return w;
}

export const publicAccount = (a) => ({
  id: a.id, username: a.username, name: a.name, role: a.role, kind: a.kind === 'staff' ? 'staff' : 'cleaner', locations: Array.isArray(a.locations) ? a.locations : [], ws: a.ws, disabled: !!a.disabled, createdAt: a.createdAt,
});

const OWNER_USER = (o) => ({ id: 'owner', username: o.username, name: 'Chủ hệ thống', role: 'owner', ws: null });

/** Đăng nhập: trả về { token, user } hoặc ném lỗi 401 */
/* ---------- Chống dò mật khẩu: sai 5 lần trong 15 phút -> khoá tên đăng nhập đó 15 phút ---------- */
const FAILS = 'security/login-fails.json';
const LOCK_AFTER = 5;
const LOCK_MS = 15 * 60 * 1000;
const failKey = (u) => createHash('sha256').update(`login:${secret()}:${u}`).digest('hex').slice(0, 20);
async function failState(u) {
  const d = (await getJSON(FAILS, { etag: false }).catch(() => null))?.data || {};
  return d[failKey(u)] || null;
}
async function noteFail(u) {
  const k = failKey(u);
  await updateJSON(FAILS, (d) => {
    const now = Date.now();
    const out = Object.fromEntries(Object.entries(d || {}).filter(([, e]) => now - e.at < 864e5)); // dọn mục cũ hơn 1 ngày
    const e = out[k] && now - out[k].at < LOCK_MS ? { ...out[k] } : { n: 0 };
    e.n += 1; e.at = now;
    if (e.n >= LOCK_AFTER) e.until = now + LOCK_MS;
    out[k] = e;
    return out;
  }, {}).catch(() => {});
}
async function clearFail(u) {
  const k = failKey(u);
  await updateJSON(FAILS, (d) => { const out = { ...(d || {}) }; delete out[k]; return out; }, {}).catch(() => {});
}

/** Đăng nhập: trả về { token, user } hoặc ném lỗi 401 / 429 */
export async function login(username, password) {
  secret();
  // đăng nhập bằng SĐT (tài khoản dùng thử): chấp nhận +84 / dấu cách
  const u = normPhone(username) || String(username || '').trim().toLowerCase();
  const fs = await failState(u);
  if (fs?.until && fs.until > Date.now()) {
    throw new HttpError(429, `Đăng nhập sai quá nhiều lần. Thử lại sau ${Math.ceil((fs.until - Date.now()) / 60000)} phút hoặc liên hệ quản trị viên.`);
  }
  const bad = async () => { await noteFail(u); return fail(); };
  const o = owner();
  if (o && safeEqual(u, o.username)) {
    if (!safeEqual(password, o.password)) throw await bad();
    if (fs) await clearFail(u);
    return { token: sign({ uid: 'owner', tv: o.tv, exp: Date.now() + TOKEN_DAYS * 864e5 }), user: OWNER_USER(o) };
  }
  const { accounts } = await loadAccounts({ fresh: true });
  if (!o && accounts.length === 0) {
    throw new HttpError(503, 'Máy chủ chưa có tài khoản chủ hệ thống: thêm HOSTY_OWNER_USERNAME và HOSTY_OWNER_PASSWORD trên Vercel rồi Redeploy.');
  }
  const acc = accounts.find((a) => a.username === u);
  if (!acc || !(await checkPassword(String(password || ''), acc.salt, acc.passHash))) throw await bad();
  if (acc.disabled) throw new HttpError(403, 'Tài khoản đã bị khoá. Liên hệ quản trị viên.');
  if (fs) await clearFail(u);
  return { token: sign({ uid: acc.id, tv: acc.tokenVersion || 0, exp: Date.now() + TOKEN_DAYS * 864e5 }), user: publicAccount(acc) };
}
async function fail() {
  await new Promise((r) => setTimeout(r, 400 + Math.random() * 200));
  return new HttpError(401, 'Sai tên đăng nhập hoặc mật khẩu');
}

/** Xác thực request; trả về user { id, username, name, role, ws } */
export async function requireUser(req) {
  const h = req.headers?.authorization || req.headers?.Authorization || '';
  const p = verify(h.replace(/^Bearer\s+/i, ''));
  if (!p) throw new HttpError(401, 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại');
  if (p.uid === 'owner') {
    const o = owner();
    if (!o || p.tv !== o.tv) throw new HttpError(401, 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại');
    return OWNER_USER(o);
  }
  let acc = (await loadAccounts()).accounts.find((a) => a.id === p.uid);
  // bản nhớ tạm có thể cũ (vừa tạo tài khoản / vừa đổi mật khẩu) -> đọc lại bản mới trước khi từ chối
  if (!acc || (acc.tokenVersion || 0) !== p.tv) acc = (await loadAccounts({ fresh: true })).accounts.find((a) => a.id === p.uid);
  if (!acc || (acc.tokenVersion || 0) !== p.tv) throw new HttpError(401, 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại');
  if (acc.disabled) throw new HttpError(403, 'Tài khoản đã bị khoá. Liên hệ quản trị viên.');
  return publicAccount(acc);
}

export function requireOwner(user) {
  if (user.role !== 'owner') throw new HttpError(403, 'Chỉ chủ hệ thống được thực hiện thao tác này');
}

export function canAccess(user, wsId) {
  return user.role === 'owner' || user.ws === wsId;
}

/** Danh sách cơ sở mà user được thấy */
export async function workspacesFor(user, { fresh = false } = {}) {
  const { workspaces } = await loadWorkspaces({ fresh });
  if (user.role === 'owner') return workspaces;
  // người trong cơ sở: không gửi lịch sử thanh toán / thông tin người đăng ký
  return workspaces.filter((w) => w.id === user.ws).map(({ payments, contact, ...w }) => w); // eslint-disable-line no-unused-vars
}

export { checkPassword };

/** Tình trạng cấu hình (không lộ giá trị) cho /api/health */
export function configStatus() {
  const o = owner();
  const s = envClean(process.env.AUTH_SECRET);
  return {
    authSecret: s.length >= 16 ? 'ok' : (s ? 'quá ngắn (cần ≥ 16 ký tự)' : 'thiếu'),
    ownerUsername: envClean(process.env.HOSTY_OWNER_USERNAME) ? 'ok' : 'thiếu',
    ownerPassword: envClean(process.env.HOSTY_OWNER_PASSWORD) ? 'ok' : 'thiếu',
    ownerUsernameLength: o ? o.username.length : 0,
  };
}

/* ---------- Link xuất lịch iCal (cho sàn đọc) ---------- */
// Link có chữ ký HMAC: không đoán được, không cần đăng nhập. Đổi AUTH_SECRET sẽ vô hiệu mọi link cũ.
// payload: { w: cơ sở, r: phòng, x: id lịch sàn nhận link (bỏ qua lịch của chính sàn đó) }
export function signFeed(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret()).update(`feed:${body}`).digest('base64url').slice(0, 22);
  return `${body}.${sig}`;
}
export function verifyFeed(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const want = createHmac('sha256', secret()).update(`feed:${body}`).digest('base64url').slice(0, 22);
  if (!safeEqual(sig, want)) return null;
  try { return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
}
