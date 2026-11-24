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
  navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
}

/** Đang mở trong trình duyệt của Zalo / Facebook / Messenger / Instagram / Line… (không nhận được thông báo đẩy) */
export const isInApp = () => /Zalo|FBAN|FBAV|FB_IAB|Instagram|Line\/|; wv\)/i.test(ua());

class StepError extends Error {
  constructor(step, message) { super(message); this.step = step; }
}
/** Chạy một bước, quá `ms` thì báo lỗi kèm tên bước (để biết kẹt ở đâu) */
const T = () => (typeof window !== 'undefined' && window.__hostexaPushTimeouts) || {};
function withTimeout(promise, ms, step, message) {
  let t;
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(t)),
    new Promise((_, rej) => { t = setTimeout(() => rej(new StepError(step, message)), T()[step] ?? ms); }),
  ]);
}
const sameKey = (sub, key) => {
  const k = sub?.options?.applicationServerKey;
  if (!k) return true; // trình duyệt không cho đọc khoá -> coi như khớp
  const a = new Uint8Array(k);
  return a.length === key.length && a.every((v, i) => v === key[i]);
};

/** Tình trạng máy này (hiện cho người dùng chụp lại khi bật không được) */
export async function pushDiag() {
  const out = [`Trang: ${location.host}`, `Quyền: ${typeof Notification === 'undefined' ? 'không hỗ trợ' : Notification.permission}`];
  try { out.push(`Quyền (Chrome): ${(await withTimeout(navigator.permissions.query({ name: 'notifications' }), 2000, 'diag', '')).state}`); } catch { /* noop */ }
  out.push(`Mở từ: ${isStandalone() ? 'biểu tượng' : isInApp() ? 'app khác' : 'trình duyệt'}`);
  const v = ua().match(/(Chrome|SamsungBrowser|Firefox|OPR|EdgA|MiuiBrowser|HeyTapBrowser)\/([\d.]+)/);
  if (v) out.push(`${v[1]} ${v[2].split('.')[0]}`);
  const a = ua().match(/Android ([\d.]+)/);
  if (a) out.push(`Android ${a[1]}`);
  try {
    const reg = await withTimeout(navigator.serviceWorker.getRegistration('/'), 3000, 'diag', '');
    out.push(`Service worker: ${reg?.active ? 'đang chạy' : reg ? 'đang cài' : 'chưa có'}`);
    if (reg) out.push(`Đăng ký đẩy: ${(await withTimeout(reg.pushManager.getSubscription(), 3000, 'diag', '')) ? 'có' : 'chưa'}`);
  } catch { out.push('Service worker: không đọc được'); }
  return out.join(' · ');
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
  const [step, setStep] = useState('');
  const [failStep, setFailStep] = useState('');
  const [diag, setDiag] = useState('');
  const [note, setNote] = useState('');
  const [perm, setPerm] = useState(() => (typeof Notification === 'undefined' ? 'default' : Notification.permission));

  const load = useCallback(async () => {
    if (demo || !ws) return;
    try { setInfo(await s.call(`/api/notify?ws=${encodeURIComponent(ws)}`)); setErr(''); } catch (e) { setErr(e.message); }
    try { setSub(await currentSub()); } catch { setSub(null); }
    if (typeof Notification !== 'undefined') setPerm(Notification.permission);
    if (pushSupported() && Notification.permission === 'denied') pushDiag().then(setDiag).catch(() => {});
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

  const enablePush = async () => {
    setBusy('push'); setErr(''); setFailStep(''); setDiag(''); setNote('');
    try {
      if (!pushSupported()) throw new StepError('support', 'Trình duyệt này không hỗ trợ thông báo');
      const key = info?.push?.publicKey;
      if (!key) throw new StepError('key', 'Chưa tải được khoá thông báo từ máy chủ, kiểm tra mạng rồi thử lại');
      const appKey = b64ToBytes(key);

      setStep('Đang xin quyền thông báo…');
      let p0 = Notification.permission;
      // kể cả khi đang 'denied' vẫn thử hỏi lại: nếu người dùng vừa mở chặn trong Chrome thì hộp hỏi sẽ hiện
      if (p0 !== 'granted') p0 = await withTimeout(Notification.requestPermission(), p0 === 'denied' ? 4000 : 15000, 'perm', 'Máy không hiện hộp xin quyền thông báo.').catch((e) => { if (Notification.permission === 'denied') return 'denied'; throw e; });
      setPerm(Notification.permission);
      if (p0 === 'denied') throw new StepError('denied', `Chrome đang chặn thông báo của ${location.host}.`);
      if (p0 !== 'granted') throw new StepError('perm', 'Bạn chưa cho phép thông báo.');

      setStep('Đang khởi động dịch vụ thông báo…');
      let reg = await withTimeout(navigator.serviceWorker.getRegistration('/'), 5000, 'sw', 'Không đọc được dịch vụ thông báo của trang.');
      if (!reg) reg = await withTimeout(navigator.serviceWorker.register('/sw.js', { scope: '/' }), 10000, 'sw', 'Không cài được dịch vụ thông báo của trang.');
      if (!reg.active) reg = await withTimeout(navigator.serviceWorker.ready, 10000, 'sw', 'Dịch vụ thông báo của trang không khởi động được.');

      setStep('Đang đăng ký với máy chủ thông báo…');
      let cur = await withTimeout(reg.pushManager.getSubscription(), 8000, 'sub', 'Không đọc được đăng ký thông báo cũ.');
      if (cur && !sameKey(cur, appKey)) { await cur.unsubscribe().catch(() => {}); cur = null; } // đăng ký cũ theo khoá khác
      if (!cur) {
        const subscribe = () => reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appKey });
        try {
          cur = await withTimeout(subscribe(), 20000, 'sub', 'Không kết nối được máy chủ thông báo của Google.');
        } catch (e) {
          if (e.name !== 'InvalidStateError') throw e instanceof StepError ? e : new StepError('sub', `Không đăng ký được thông báo (${e.message || e.name}).`);
          const old = await reg.pushManager.getSubscription();
          await old?.unsubscribe();
          cur = await withTimeout(subscribe(), 20000, 'sub', 'Không kết nối được máy chủ thông báo của Google.');
        }
      }

      setStep('Đang lưu…');
      await withTimeout(post({ action: 'push-sub', sub: cur.toJSON() }), 15000, 'save', 'Máy chủ Hostexa không phản hồi, thử lại.');
      setStep('');
      await load();
      // gửi thử chạy nền, không bắt người dùng chờ
      withTimeout(post({ action: 'push-test' }), 15000, 'test', '').catch(() => setNote('Đã bật, nhưng thông báo thử chưa tới. Bấm "Gửi thử" để kiểm tra lại.'));
    } catch (e) {
      setFailStep(e.step || 'other');
      setErr(e.message || 'Không bật được thông báo');
      pushDiag().then(setDiag).catch(() => {});
    } finally { setStep(''); setBusy(''); }
  };
  const disablePush = run('push', async () => {
    const cur = await currentSub();
    if (cur) { await post({ action: 'push-unsub', endpoint: cur.endpoint }).catch(() => {}); await cur.unsubscribe(); }
  });
  const testPush = run('test', () => post({ action: 'push-test' }));
  const sendDaily = run('daily', async () => {
    const r = await post({ action: 'push-daily-now' });
    setNote(`Đã gửi tổng quan: ${r.body}`);
    return r;
  });
  const setPref = (k, v) => {
    setInfo((i) => (i ? { ...i, push: { ...i.push, prefs: { ...(i.push?.prefs || {}), [k]: v } } } : i));
    post({ action: 'push-prefs', prefs: { [k]: v } }).catch((e) => { setErr(e.message); load(); });
  };

  return {
    demo, info, err, busy, load, step, failStep, diag, note, perm,
    pushOn: !!sub && (info?.push?.devices || 0) > 0,
    enablePush, disablePush, testPush, setPref, sendDaily,
  };
}
