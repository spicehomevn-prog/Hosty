// Lưu trữ JSON cho Hostexa.
// - Trên Vercel: Vercel Blob (biến BLOB_READ_WRITE_TOKEN tự có khi kết nối Blob store vào project).
// - Chạy local (npm run dev) chưa có token: file trong thư mục .hosty-sync/ của máy.
// Mọi lần ghi có thể kèm ifMatch (ETag) để không ghi đè dữ liệu mới hơn.
// Tiết kiệm "Simple Operations" của Vercel Blob (mỗi head / mỗi lần đọc trượt cache = 1 op):
// - getJSON(name) mặc định: head + get (2 op) – CHỈ cần khi sẽ ghi có điều kiện (cần ETag đúng).
// - getJSON(name, { etag: false }): chỉ 1 lần get; thêm { cache: true } để dùng cache CDN (≤ 60s, phần lớn không tính op);
//   thêm { memo: ms } để nhớ trong bộ nhớ của instance (0 op khi đọc lại trong khoảng đó).
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = 'hosty/';

export class ConflictError extends Error {
  constructor() { super('conflict'); this.name = 'ConflictError'; }
}

/** Chế độ truy cập blob đang dùng ('private' an toàn hơn; 'public' = ai biết đường dẫn đều tải được) */
export const blobAccess = () => access;

export function storeMode() {
  if (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID) return 'blob';
  if (process.env.HOSTY_LOCAL_STORE) return 'local';
  return null;
}

/** Bộ đếm thao tác (để đo / kiểm tra): simple = head + đọc, advanced = ghi */
export const ops = { simple: 0, advanced: 0 };

/* ---------- Local (dev) ---------- */
const localFile = (p) => path.join(process.cwd(), '.hosty-sync', ...p.split('/'));
const sha = (s) => createHash('sha1').update(s).digest('hex');
const locks = new Map();
async function localGet(p) {
  try {
    const text = await fs.readFile(localFile(p), 'utf8');
    return { data: JSON.parse(text), etag: sha(text) };
  } catch { return null; }
}
async function localPut(p, obj, { ifMatch, create } = {}) {
  // khoá đơn giản trong tiến trình để mô phỏng ghi có điều kiện
  while (locks.get(p)) await locks.get(p);
  let release;
  locks.set(p, new Promise((r) => { release = r; }));
  try {
    const cur = await localGet(p);
    if (create && cur) throw new ConflictError();
    if (ifMatch && (!cur || cur.etag !== ifMatch)) throw new ConflictError();
    const text = JSON.stringify(obj);
    await fs.mkdir(path.dirname(localFile(p)), { recursive: true });
    await fs.writeFile(localFile(p), text);
    return { etag: sha(text) };
  } finally { locks.delete(p); release(); }
}
async function localDel(p) { try { await fs.unlink(localFile(p)); } catch { /* noop */ } }

/* ---------- Vercel Blob ---------- */
// Ưu tiên blob "private"; store không hỗ trợ thì dùng "public" (đường dẫn chỉ server biết).
let access = process.env.HOSTY_BLOB_ACCESS || null;
// Luôn dùng token read-write: nếu project có BLOB_STORE_ID, thư viện sẽ tự chọn OIDC thay vì token,
// dễ lỗi quyền theo môi trường (Production/Preview). Truyền token trực tiếp để tránh việc đó.
const auth = () => (process.env.BLOB_READ_WRITE_TOKEN ? { token: process.env.BLOB_READ_WRITE_TOKEN } : {});
const isConflict = (e) => /precondition|already exists|etag/i.test(`${e?.name} ${e?.message}`);

// Blob chưa tồn tại (khác với lỗi "store does not exist")
const isMissing = (e, mod) => (mod.BlobNotFoundError && e instanceof mod.BlobNotFoundError)
  || /requested blob does not exist|not.?found/i.test(`${e?.name} ${e?.message}`);

async function blobGetPrivate(p) {
  const mod = await import('@vercel/blob');
  ops.simple += 2;
  // ETag phải lấy từ API (head) — đúng loại mà put({ ifMatch }) so sánh.
  // ETag trong header HTTP khi tải file (get) là của CDN, khác định dạng -> ghi có điều kiện luôn bị từ chối.
  let meta;
  try { meta = await mod.head(p, auth()); } catch (e) { if (isMissing(e, mod)) return null; throw e; }
  if (!meta) return null;
  const res = await mod.get(p, { access: 'private', useCache: false, ...auth() });
  if (!res || res.statusCode !== 200) return null;
  // đọc head TRƯỚC get: nếu file vừa đổi, nội dung mới hơn ETag -> lần ghi sau bị từ chối và thử lại (an toàn)
  return { data: JSON.parse(await new Response(res.stream).text()), etag: meta.etag };
}
async function blobGetPublic(p) {
  const mod = await import('@vercel/blob');
  ops.simple += 2;
  let meta;
  try { meta = await mod.head(p, auth()); } catch (e) { if (isMissing(e, mod)) return null; throw e; }
  if (!meta) return null;
  const r = await fetch(`${meta.url}?t=${Date.now()}`, { cache: 'no-store' });
  if (!r.ok) return null;
  return { data: await r.json(), etag: meta.etag };
}
async function blobPut(p, obj, acc, { ifMatch, create } = {}) {
  const { put } = await import('@vercel/blob');
  ops.advanced += 1;
  try {
    const res = await put(p, JSON.stringify(obj), {
      access: acc, addRandomSuffix: false, allowOverwrite: !create, contentType: 'application/json',
      cacheControlMaxAge: 60, ...(ifMatch ? { ifMatch } : {}), ...auth(),
    });
    return { etag: res.etag };
  } catch (e) {
    if (isConflict(e)) throw new ConflictError();
    throw e;
  }
}

async function blobGet(p) {
  if (access !== 'public') {
    try {
      const r = await blobGetPrivate(p);
      if (r) { access = 'private'; return r; }
      if (access === 'private') return null;
    } catch (e) {
      if (access === 'private') throw e;
    }
  }
  const r = await blobGetPublic(p);
  if (r) access = 'public';
  return r;
}
async function blobSet(p, obj, opts) {
  if (access === 'public') return blobPut(p, obj, 'public', opts);
  try {
    const r = await blobPut(p, obj, 'private', opts);
    access = 'private';
    return r;
  } catch (e) {
    if (access === 'private' || e instanceof ConflictError) throw e;
    try { const r = await blobPut(p, obj, 'public', opts); access = 'public'; return r; } catch { throw e; }
  }
}
/** Đọc nhanh không cần ETag: 1 lần get theo pathname (không head). cache = cho phép cache CDN. */
async function blobReadFast(p, cache) {
  const mod = await import('@vercel/blob');
  const once = async (acc) => {
    ops.simple += 1;
    const res = await mod.get(p, { access: acc, useCache: cache, ...auth() });
    if (!res) return { missing: true };
    if (res.statusCode !== 200) return null;
    return { data: JSON.parse(await new Response(res.stream).text()), etag: null };
  };
  if (access !== 'public') {
    try {
      const r = await once('private');
      if (r && !r.missing) { access = 'private'; return r; }
      if (access === 'private') return null;
    } catch (e) {
      if (access === 'private') throw e;
    }
  }
  // store public: cần bản mới nhất thì vẫn dùng cách cũ (CDN của blob public luôn cache)
  if (!cache) return blobGetPublic(p);
  try {
    const r = await once('public');
    if (r && !r.missing) access = 'public';
    return r && !r.missing ? r : null;
  } catch { return blobGetPublic(p); }
}

async function blobDel(p) {
  const { del } = await import('@vercel/blob');
  try { await del(p, auth()); } catch { /* noop */ }
}

/* ---------- API chung ---------- */
const memo = new Map(); // name -> { at, value }
/**
 * Đọc JSON. opts:
 *  - etag (mặc định true): cần ETag để ghi có điều kiện -> head + get. false -> chỉ get (etag = null).
 *  - cache: cho phép cache CDN của Vercel Blob (tối đa 60s cũ) – dùng cho file ít đổi.
 *  - memo (ms): nhớ kết quả trong bộ nhớ instance.
 */
export async function getJSON(name, { etag = true, cache = false, memo: memoMs = 0 } = {}) {
  const p = ROOT + name;
  if (memoMs > 0) {
    const m = memo.get(name);
    if (m && Date.now() - m.at < memoMs) return m.value;
  }
  let value;
  if (storeMode() === 'local') {
    ops.simple += etag ? 2 : 1;
    value = await localGet(p);
    if (value && !etag) value = { ...value, etag: null };
  } else {
    value = etag ? await blobGet(p) : await blobReadFast(p, cache);
  }
  if (memoMs > 0) memo.set(name, { at: Date.now(), value });
  return value;
}
/** Xoá bộ nhớ đọc của một file (sau khi ghi) */
export const forget = (name) => memo.delete(name);
/** opts: { ifMatch: etag } chỉ ghi khi chưa ai sửa; { create: true } chỉ ghi khi chưa tồn tại */
export async function putJSON(name, obj, opts = {}) {
  const p = ROOT + name;
  memo.delete(name);
  if (storeMode() === 'local') ops.advanced += 1;
  return storeMode() === 'local' ? localPut(p, obj, opts) : blobSet(p, obj, opts);
}
export async function delJSON(name) {
  const p = ROOT + name;
  memo.delete(name);
  return storeMode() === 'local' ? localDel(p) : blobDel(p);
}

/** Đọc - sửa - ghi có điều kiện, tự thử lại khi bị ghi chồng */
export async function updateJSON(name, fn, fallback) {
  for (let i = 0; i < 5; i++) {
    const cur = await getJSON(name);
    // chụp nội dung TRƯỚC khi fn chạy (nhiều hàm sửa thẳng vào object rồi trả lại chính nó)
    const before = cur ? JSON.stringify(cur.data) : null;
    const next = await fn(cur ? cur.data : structuredClone(fallback));
    // không đổi gì -> không ghi (tiết kiệm thao tác)
    if (cur && next != null && JSON.stringify(next) === before) return next;
    try {
      await putJSON(name, next, cur ? { ifMatch: cur.etag } : { create: true });
      return next;
    } catch (e) {
      if (!(e instanceof ConflictError)) throw e;
    }
  }
  throw new Error('Máy chủ bận, vui lòng thử lại');
}
