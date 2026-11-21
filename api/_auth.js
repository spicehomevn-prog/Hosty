// Tài khoản & phiên đăng nhập của Hostexa
// - Chủ hệ thống (owner): khai báo bằng biến môi trường HOSTY_OWNER_USERNAME / HOSTY_OWNER_PASSWORD.
// - Tài khoản cơ sở (admin / member): lưu trong hosty/accounts.json, do owner tạo.
import { scrypt as _scrypt, randomBytes, createHmac, createHash, timingSafeEqual, randomInt } from 'node:crypto';
import { promisify } from 'node:util';
import { getJSON } from './_store.js';
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
export async function loadAccounts() {
  const r = await getJSON(ACCOUNTS);
  return r ? r.data : { accounts: [] };
}
export async function loadWorkspaces() {
  const r = await getJSON(WORKSPACES);
  return r ? r.data : { workspaces: [] };
}

export const publicAccount = (a) => ({
  id: a.id, username: a.username, name: a.name, role: a.role, ws: a.ws, disabled: !!a.disabled, createdAt: a.createdAt,
});

const OWNER_USER = (o) => ({ id: 'owner', username: o.username, name: 'Chủ hệ thống', role: 'owner', ws: null });

/** Đăng nhập: trả về { token, user } hoặc ném lỗi 401 */
export async function login(username, password) {
  secret();
  const u = String(username || '').trim().toLowerCase();
  const o = owner();
  if (o && safeEqual(u, o.username)) {
    if (!safeEqual(password, o.password)) throw await fail();
    return { token: sign({ uid: 'owner', tv: o.tv, exp: Date.now() + TOKEN_DAYS * 864e5 }), user: OWNER_USER(o) };
  }
  const { accounts } = await loadAccounts();
  if (!o && accounts.length === 0) {
    throw new HttpError(503, 'Máy chủ chưa có tài khoản chủ hệ thống: thêm HOSTY_OWNER_USERNAME và HOSTY_OWNER_PASSWORD trên Vercel rồi Redeploy.');
  }
  const acc = accounts.find((a) => a.username === u);
  if (!acc || !(await checkPassword(String(password || ''), acc.salt, acc.passHash))) throw await fail();
  if (acc.disabled) throw new HttpError(403, 'Tài khoản đã bị khoá. Liên hệ quản trị viên.');
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
  const { accounts } = await loadAccounts();
  const acc = accounts.find((a) => a.id === p.uid);
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
export async function workspacesFor(user) {
  const { workspaces } = await loadWorkspaces();
  return user.role === 'owner' ? workspaces : workspaces.filter((w) => w.id === user.ws);
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
