// Nhắc hẹn task trên máy người dùng: thông báo đẩy (Web Push)
import { useCallback, useEffect, useState } from 'react';
import { useSession } from './session.jsx';

const ua = () => (typeof navigator === 'undefined' ? '' : navigator.userAgent || '');
export const isIOS = () => /iPhone|iPad|iPod/.test(ua()) || (/Macintosh/.test(ua()) && navigator.maxTouchPoints > 1);
export const isAndroid = () => /Android/i.test(ua());
/** Đang mở từ biểu tượng ngoài màn hình chính (PWA) */
export const isStandalone = () => typeof window !== 'undefined'
  && (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);
export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export function registerSW() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

const b64ToBytes = (s) => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

async function currentSub() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration('/');
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Trạng thái nhắc hẹn của người dùng ở cơ sở đang mở + các thao tác */
export function useNotify() {
  const s = useSession();
  const ws = s.workspace?.id;
  const demo = s.role === 'demo';
  const [info, setInfo] = useState(null);
  const [sub, setSub] = useState(null); // máy này đã bật thông báo
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    if (demo || !ws) return;
    try { setInfo(await s.call(`/api/notify?ws=${encodeURIComponent(ws)}`)); setErr(''); } catch (e) { setErr(e.message); }
    try { setSub(await currentSub()); } catch { setSub(null); }
  }, [demo, ws]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
    // quay lại app (vd. sau khi bật thông báo trong Cài đặt máy) -> tải lại trạng thái
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [load]);

  const post = (body) => s.call('/api/notify', { method: 'POST', body: { ws, ...body } });
  const run = (name, fn) => async () => {
    setBusy(name); setErr('');
    try { const r = await fn(); await load(); return r; } catch (e) { setErr(e.message); return null; } finally { setBusy(''); }
  };

  const enablePush = run('push', async () => {
    if (!pushSupported()) throw new Error('Trình duyệt này không hỗ trợ thông báo');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('Bạn chưa cho phép thông báo. Mở Cài đặt của máy > Thông báo > Hostexa để bật.');
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    let cur = await reg.pushManager.getSubscription();
    const key = info?.push?.publicKey;
    if (!key) throw new Error('Chưa tải được khoá thông báo, thử lại');
    if (!cur) cur = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
    await post({ action: 'push-sub', sub: cur.toJSON() });
    await post({ action: 'push-test' }).catch(() => {});
  });
  const disablePush = run('push', async () => {
    const cur = await currentSub();
    if (cur) { await post({ action: 'push-unsub', endpoint: cur.endpoint }).catch(() => {}); await cur.unsubscribe(); }
  });
  const testPush = run('test', () => post({ action: 'push-test' }));

  return {
    demo, info, err, busy, load,
    pushOn: !!sub && (info?.push?.devices || 0) > 0,
    enablePush, disablePush, testPush,
  };
}
