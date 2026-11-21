// Vercel Serverless Function: đồng bộ dữ liệu Hosty giữa các máy bằng mã.
// POST /api/sync  { data, code?, baseVersion?, force?, device? }  -> { code, updatedAt }
// GET  /api/sync?code=XXXXXXXX[&meta=1]                           -> { code, updatedAt, device, data? }
import { randomInt } from 'node:crypto';
import { readPack, writePack, storeMode } from './_store.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // bỏ O/0, I/1 để dễ đọc
const CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/;
const MAX_BYTES = 3 * 1024 * 1024;

const normalize = (c = '') => String(c).toUpperCase().replace(/[^A-Z0-9]/g, '');
const newCode = () => Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

async function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  }
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BYTES) throw Object.assign(new Error('too big'), { status: 413 });
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

export default async function handler(req, res) {
  if (!storeMode()) {
    return send(res, 503, { error: 'Máy chủ chưa bật lưu trữ đồng bộ (Vercel Blob). Xem hướng dẫn trong README.' });
  }
  try {
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const code = normalize(url.searchParams.get('code'));
      if (!CODE_RE.test(code)) return send(res, 400, { error: 'Mã đồng bộ không hợp lệ (8 ký tự)' });
      const pack = await readPack(code);
      if (!pack) return send(res, 404, { error: 'Không tìm thấy gói dữ liệu với mã này' });
      const meta = { code, updatedAt: pack.updatedAt, device: pack.device || '' };
      return send(res, 200, url.searchParams.get('meta') ? meta : { ...meta, data: pack.data });
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      const data = body?.data;
      if (!data || typeof data !== 'object' || !Array.isArray(data.locations)) {
        return send(res, 400, { error: 'Dữ liệu không hợp lệ' });
      }
      if (JSON.stringify(data).length > MAX_BYTES) return send(res, 413, { error: 'Dữ liệu quá lớn' });
      let code = normalize(body.code);
      if (code) {
        if (!CODE_RE.test(code)) return send(res, 400, { error: 'Mã đồng bộ không hợp lệ' });
        const existing = await readPack(code);
        if (existing && !body.force && Number(body.baseVersion || 0) < existing.updatedAt) {
          return send(res, 409, {
            error: 'Gói trên máy chủ mới hơn dữ liệu của máy này',
            updatedAt: existing.updatedAt, device: existing.device || '',
          });
        }
      } else {
        for (let i = 0; i < 5; i++) {
          code = newCode();
          if (!(await readPack(code))) break;
        }
      }
      const pack = { v: 1, code, updatedAt: Date.now(), device: String(body.device || '').slice(0, 60), data };
      await writePack(code, pack);
      return send(res, 200, { code, updatedAt: pack.updatedAt, device: pack.device });
    }

    res.setHeader('Allow', 'GET, POST');
    return send(res, 405, { error: 'Method not allowed' });
  } catch (e) {
    if (e.status === 413) return send(res, 413, { error: 'Dữ liệu quá lớn' });
    if (e instanceof SyntaxError) return send(res, 400, { error: 'Dữ liệu gửi lên không đúng định dạng' });
    console.error('sync error', e);
    return send(res, 500, { error: 'Lỗi máy chủ khi đồng bộ, vui lòng thử lại' });
  }
}
