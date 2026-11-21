export const MAX_BYTES = 3 * 1024 * 1024;

export class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}

export function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

export async function readBody(req) {
  if (req.body !== undefined && req.body !== null && req.body !== '') {
    return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  }
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BYTES) throw new HttpError(413, 'Dữ liệu quá lớn');
    chunks.push(c);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

export const query = (req) => new URL(req.url, 'http://localhost').searchParams;

/** Bọc handler: bắt lỗi chung, kiểm tra cấu hình lưu trữ */
export function route(fn, { needStore = true } = {}) {
  return async (req, res) => {
    try {
      if (needStore) {
        const { storeMode } = await import('./_store.js');
        if (!storeMode()) throw new HttpError(503, 'Máy chủ chưa bật lưu trữ (Vercel Blob). Xem hướng dẫn trong README.');
      }
      await fn(req, res);
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message, ...(e.extra || {}) });
      if (e instanceof SyntaxError) return send(res, 400, { error: 'Dữ liệu gửi lên không đúng định dạng' });
      console.error('api error', e);
      return send(res, 500, { error: e.message && /Máy chủ bận/.test(e.message) ? e.message : 'Lỗi máy chủ, vui lòng thử lại' });
    }
  };
}
