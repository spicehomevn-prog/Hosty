// Vercel Serverless Function: proxy tải file iCal (tránh lỗi CORS khi gọi từ trình duyệt)
// GET /api/ical?url=<link ical>
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

function send(res, status, body, headers = {}) {
  res.statusCode = status;
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(body);
}

export default async function handler(req, res) {
  const reqUrl = new URL(req.url, 'http://localhost');
  let target = (reqUrl.searchParams.get('url') || '').trim();
  if (!target) return send(res, 400, JSON.stringify({ error: 'Thiếu tham số url' }), { 'Content-Type': 'application/json' });
  if (target.startsWith('webcal://')) target = 'https://' + target.slice(9);

  let parsed;
  try { parsed = new URL(target); } catch {
    return send(res, 400, JSON.stringify({ error: 'Link iCal không hợp lệ' }), { 'Content-Type': 'application/json' });
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return send(res, 400, JSON.stringify({ error: 'Chỉ hỗ trợ link http/https' }), { 'Content-Type': 'application/json' });
  }
  try {
    const host = parsed.hostname.replace(/^\[|\]$/g, '');
    if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('blocked');
    const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
    if (addrs.some((a) => isPrivateIp(a.address))) throw new Error('blocked');
  } catch {
    return send(res, 400, JSON.stringify({ error: 'Không truy cập được máy chủ của link này' }), { 'Content-Type': 'application/json' });
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(parsed.toString(), {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HomestayCalendar/1.0)', Accept: 'text/calendar, text/plain, */*' },
    });
    const text = await r.text();
    if (!r.ok) {
      return send(res, 502, JSON.stringify({ error: `Sàn trả về lỗi ${r.status}` }), { 'Content-Type': 'application/json' });
    }
    if (!text.includes('BEGIN:VCALENDAR')) {
      return send(res, 422, JSON.stringify({ error: 'Link không phải file lịch iCal (.ics)' }), { 'Content-Type': 'application/json' });
    }
    return send(res, 200, text, {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 's-maxage=300, stale-while-revalidate=600',
    });
  } catch (e) {
    const msg = e.name === 'AbortError' ? 'Hết thời gian chờ khi tải lịch' : 'Không tải được lịch';
    return send(res, 502, JSON.stringify({ error: msg }), { 'Content-Type': 'application/json' });
  } finally {
    clearTimeout(timer);
  }
}
