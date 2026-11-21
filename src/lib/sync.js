// Đồng bộ dữ liệu giữa các máy bằng mã 8 ký tự
export const formatCode = (c = '') => {
  const s = c.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  return s.length > 4 ? `${s.slice(0, 4)}-${s.slice(4)}` : s;
};
export const cleanCode = (c = '') => c.toUpperCase().replace(/[^A-Z0-9]/g, '');
export const isCode = (c = '') => /^[A-HJ-NP-Z2-9]{8}$/.test(cleanCode(c));

export function deviceLabel() {
  const ua = navigator.userAgent;
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
    : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Máy khác';
  const br = /Edg\//.test(ua) ? 'Edge' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  return br ? `${os} · ${br}` : os;
}

export const syncLink = (code) => `${location.origin}/?sync=${cleanCode(code)}`;

async function call(url, opts) {
  let r;
  try { r = await fetch(url, opts); } catch { throw new Error('Không kết nối được máy chủ. Kiểm tra mạng và thử lại.'); }
  let body = {};
  try { body = await r.json(); } catch { /* noop */ }
  if (!r.ok) {
    const err = new Error(body.error || `Lỗi ${r.status}`);
    err.status = r.status;
    err.info = body;
    throw err;
  }
  return body;
}

/** Dữ liệu được đóng gói: toàn bộ trừ thông tin đồng bộ của riêng máy này */
export function packData(state) {
  const { syncMeta, ...data } = state; // eslint-disable-line no-unused-vars
  return data;
}

export const uploadPack = ({ data, code, baseVersion, force }) =>
  call('/api/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data, code: code ? cleanCode(code) : undefined, baseVersion, force, device: deviceLabel() }),
  });

export const fetchPack = (code) => call(`/api/sync?code=${cleanCode(code)}`);
export const fetchPackMeta = (code) => call(`/api/sync?code=${cleanCode(code)}&meta=1`);
