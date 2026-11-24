// Tải file iCal từ link của sàn (chặn địa chỉ nội bộ để tránh bị lợi dụng truy cập mạng trong)
import dns from 'node:dns/promises';
import net from 'node:net';

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 10 || a === 127 || a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  const v = ip.toLowerCase();
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('::ffff:');
}

export class FetchIcsError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/** Trả về nội dung .ics (chuỗi) hoặc ném FetchIcsError(status, message tiếng Việt) */
export async function fetchIcs(rawUrl) {
  let target = String(rawUrl || '').trim();
  if (!target) throw new FetchIcsError(400, 'Thiếu link iCal');
  if (target.startsWith('webcal://')) target = 'https://' + target.slice(9);
  let parsed;
  try { parsed = new URL(target); } catch { throw new FetchIcsError(400, 'Link iCal không hợp lệ'); }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    // tự đi theo chuyển hướng (tối đa 4 lần), kiểm tra địa chỉ ở MỖI lần để không bị dẫn vào mạng nội bộ
    let r;
    for (let hop = 0; ; hop++) {
      await assertPublic(parsed);
      r = await fetch(parsed.toString(), {
        signal: ctrl.signal,
        redirect: 'manual',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Hostexa/1.0)', Accept: 'text/calendar, text/plain, */*' },
      });
      const loc = r.status >= 300 && r.status < 400 ? r.headers.get('location') : null;
      if (!loc) break;
      if (hop >= 4) throw new FetchIcsError(502, 'Link chuyển hướng quá nhiều lần');
      try { parsed = new URL(loc, parsed); } catch { throw new FetchIcsError(502, 'Link chuyển hướng không hợp lệ'); }
    }
    if (!r.ok) throw new FetchIcsError(502, `Sàn trả về lỗi ${r.status}`);
    const text = await readLimited(r, MAX_ICS);
    if (!text.includes('BEGIN:VCALENDAR')) throw new FetchIcsError(422, 'Link không phải file lịch iCal (.ics)');
    return text;
  } catch (e) {
    if (e instanceof FetchIcsError) throw e;
    throw new FetchIcsError(502, e.name === 'AbortError' ? 'Hết thời gian chờ khi tải lịch' : 'Không tải được lịch');
  } finally {
    clearTimeout(timer);
  }
}

const MAX_ICS = 5 * 1024 * 1024; // lịch iCal lớn nhất nhận (5 MB)
async function assertPublic(u) {
  if (!['http:', 'https:'].includes(u.protocol)) throw new FetchIcsError(400, 'Chỉ hỗ trợ link http/https');
  try {
    const host = u.hostname.replace(/^\[|\]$/g, '');
    if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('blocked');
    const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
    if (!addrs.length || addrs.some((x) => isPrivateIp(x.address))) throw new Error('blocked');
  } catch {
    throw new FetchIcsError(400, 'Không truy cập được máy chủ của link này');
  }
}
async function readLimited(r, max) {
  const reader = r.body?.getReader();
  if (!reader) return '';
  const chunks = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) { reader.cancel().catch(() => {}); throw new FetchIcsError(413, 'File lịch quá lớn'); }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
}
