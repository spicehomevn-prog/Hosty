// Lưu trữ JSON cho Hostexa.
// - Trên Vercel: Vercel Blob (biến BLOB_READ_WRITE_TOKEN tự có khi kết nối Blob store vào project).
// - Chạy local (npm run dev) chưa có token: file trong thư mục .hosty-sync/ của máy.
// Mọi lần ghi có thể kèm ifMatch (ETag) để không ghi đè dữ liệu mới hơn.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = 'hosty/';

export class ConflictError extends Error {
  constructor() { super('conflict'); this.name = 'ConflictError'; }
}

export function storeMode() {
  if (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID) return 'blob';
  if (process.env.HOSTY_LOCAL_STORE) return 'local';
  return null;
}

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

async function blobGetPrivate(p) {
  const { get } = await import('@vercel/blob');
  const res = await get(p, { access: 'private', useCache: false, ...auth() });
  if (!res || res.statusCode !== 200) return null;
  return { data: JSON.parse(await new Response(res.stream).text()), etag: res.blob.etag };
}
// Blob chưa tồn tại (khác với lỗi "store does not exist")
const isMissing = (e, mod) => (mod.BlobNotFoundError && e instanceof mod.BlobNotFoundError)
  || /requested blob does not exist|not.?found/i.test(`${e?.name} ${e?.message}`);

async function blobGetPublic(p) {
  const mod = await import('@vercel/blob');
  let meta;
  try { meta = await mod.head(p, auth()); } catch (e) { if (isMissing(e, mod)) return null; throw e; }
  if (!meta) return null;
  const r = await fetch(`${meta.url}?t=${Date.now()}`, { cache: 'no-store' });
  if (!r.ok) return null;
  return { data: await r.json(), etag: meta.etag };
}
async function blobPut(p, obj, acc, { ifMatch, create } = {}) {
  const { put } = await import('@vercel/blob');
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
async function blobDel(p) {
  const { del } = await import('@vercel/blob');
  try { await del(p, auth()); } catch { /* noop */ }
}

/* ---------- API chung ---------- */
export async function getJSON(name) {
  const p = ROOT + name;
  return storeMode() === 'local' ? localGet(p) : blobGet(p);
}
/** opts: { ifMatch: etag } chỉ ghi khi chưa ai sửa; { create: true } chỉ ghi khi chưa tồn tại */
export async function putJSON(name, obj, opts = {}) {
  const p = ROOT + name;
  return storeMode() === 'local' ? localPut(p, obj, opts) : blobSet(p, obj, opts);
}
export async function delJSON(name) {
  const p = ROOT + name;
  return storeMode() === 'local' ? localDel(p) : blobDel(p);
}

/** Đọc - sửa - ghi có điều kiện, tự thử lại khi bị ghi chồng */
export async function updateJSON(name, fn, fallback) {
  for (let i = 0; i < 5; i++) {
    const cur = await getJSON(name);
    const next = await fn(cur ? cur.data : structuredClone(fallback));
    try {
      await putJSON(name, next, cur ? { ifMatch: cur.etag } : { create: true });
      return next;
    } catch (e) {
      if (!(e instanceof ConflictError)) throw e;
    }
  }
  throw new Error('Máy chủ bận, vui lòng thử lại');
}
