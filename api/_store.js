// Nơi lưu "gói dữ liệu" đồng bộ.
// - Trên Vercel: Vercel Blob (cần biến môi trường BLOB_READ_WRITE_TOKEN — tự có khi kết nối Blob store vào project).
// - Khi chạy local (npm run dev) mà chưa có token: lưu file trong thư mục .hosty-sync/ của máy.
import { promises as fs } from 'node:fs';
import path from 'node:path';

const PREFIX = 'hosty-sync/';

export function storeMode() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return 'blob';
  if (process.env.HOSTY_LOCAL_STORE) return 'local';
  return null;
}

/* ---------- Local (dev) ---------- */
const localDir = () => path.join(process.cwd(), '.hosty-sync');
async function localRead(code) {
  try { return JSON.parse(await fs.readFile(path.join(localDir(), `${code}.json`), 'utf8')); } catch { return null; }
}
async function localWrite(code, obj) {
  await fs.mkdir(localDir(), { recursive: true });
  await fs.writeFile(path.join(localDir(), `${code}.json`), JSON.stringify(obj));
}

/* ---------- Vercel Blob ---------- */
// Ưu tiên blob "private"; nếu store chỉ hỗ trợ public thì dùng public + đường dẫn có hậu tố ngẫu nhiên.
let access = process.env.HOSTY_BLOB_ACCESS || null; // 'private' | 'public' | null (tự dò)

async function blobReadPrivate(code) {
  const { get } = await import('@vercel/blob');
  const res = await get(`${PREFIX}${code}.json`, { access: 'private', useCache: false });
  if (!res || res.statusCode !== 200) return null;
  return JSON.parse(await new Response(res.stream).text());
}
async function blobReadPublic(code) {
  const { list } = await import('@vercel/blob');
  const { blobs } = await list({ prefix: `${PREFIX}${code}/` });
  if (!blobs.length) return null;
  blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  const r = await fetch(blobs[0].url, { cache: 'no-store' });
  return r.ok ? r.json() : null;
}
async function blobWritePrivate(code, obj) {
  const { put } = await import('@vercel/blob');
  await put(`${PREFIX}${code}.json`, JSON.stringify(obj), {
    access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json', cacheControlMaxAge: 60,
  });
}
async function blobWritePublic(code, obj) {
  const { put, list, del } = await import('@vercel/blob');
  const res = await put(`${PREFIX}${code}/pack.json`, JSON.stringify(obj), {
    access: 'public', addRandomSuffix: true, contentType: 'application/json', cacheControlMaxAge: 60,
  });
  const { blobs } = await list({ prefix: `${PREFIX}${code}/` });
  const old = blobs.filter((b) => b.url !== res.url).map((b) => b.url);
  if (old.length) await del(old);
}

async function blobRead(code) {
  if (access !== 'public') {
    try {
      const r = await blobReadPrivate(code);
      if (r) { access = 'private'; return r; }
      if (access === 'private') return null;
    } catch (e) {
      if (access === 'private') throw e;
    }
  }
  const r = await blobReadPublic(code);
  if (r) access = 'public';
  return r;
}

async function blobWrite(code, obj) {
  if (access === 'public') return blobWritePublic(code, obj);
  try {
    await blobWritePrivate(code, obj);
    access = 'private';
  } catch (e) {
    if (access === 'private') throw e;
    try { await blobWritePublic(code, obj); access = 'public'; } catch { throw e; }
  }
}

export async function readPack(code) {
  if (storeMode() === 'local') return localRead(code);
  return blobRead(code);
}

export async function writePack(code, obj) {
  if (storeMode() === 'local') return localWrite(code, obj);
  return blobWrite(code, obj);
}
