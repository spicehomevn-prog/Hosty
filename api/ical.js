// Vercel Serverless Function: proxy tải file iCal (tránh lỗi CORS khi gọi từ trình duyệt)
// GET /api/ical?url=<link ical>
import { fetchIcs, FetchIcsError } from './_fetchics.js';

function send(res, status, body, headers = {}) {
  res.statusCode = status;
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(body);
}

export default async function handler(req, res) {
  const reqUrl = new URL(req.url, 'http://localhost');
  try {
    const text = await fetchIcs(reqUrl.searchParams.get('url'));
    return send(res, 200, text, {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 's-maxage=300, stale-while-revalidate=600',
    });
  } catch (e) {
    const status = e instanceof FetchIcsError ? e.status : 502;
    return send(res, status, JSON.stringify({ error: e.message || 'Không tải được lịch' }), { 'Content-Type': 'application/json' });
  }
}
