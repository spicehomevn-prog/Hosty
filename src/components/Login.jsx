import { useEffect, useRef, useState } from 'react';
import { CalendarPlus, Sparkles, CheckCircle2, LogIn, Eye, EyeOff, Loader2, User, Lock, Building2, Bell } from '../lib/icons.jsx';
import { TRIAL, normPhone } from '../lib/plan.js';
import { useSession } from '../lib/session.jsx';
import { Logo } from './Logo.jsx';

/** Đăng ký dùng thử miễn phí: tạo cơ sở + tài khoản admin (đăng nhập bằng SĐT) */
function Signup({ onBack }) {
  const { signup } = useSession();
  const [f, setF] = useState({ wsName: '', name: '', phone: '', password: '', again: '' });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  // hiện form ngay (không chờ hiệu ứng) và cuộn tới ô đầu tiên
  const formRef = useRef(null);
  useEffect(() => {
    const el = formRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => el.querySelector('input')?.focus({ preventScroll: true }), 350);
  }, []);
  const submit = async (e) => {
    e.preventDefault();
    if (!f.wsName.trim()) return setErr('Nhập tên cơ sở (homestay / khách sạn)');
    if (!f.name.trim()) return setErr('Nhập họ tên của bạn');
    if (!normPhone(f.phone)) return setErr('Số điện thoại chưa đúng (10 số, vd 0912 345 678)');
    if (f.password.length < 6) return setErr('Mật khẩu cần ít nhất 6 ký tự');
    if (f.password !== f.again) return setErr('Nhập lại mật khẩu chưa khớp');
    setBusy(true); setErr('');
    try { await signup({ wsName: f.wsName.trim(), name: f.name.trim(), phone: f.phone, password: f.password }); } catch (e2) { setErr(e2.message); setBusy(false); }
  };
  return (
    <form className="login-form signup-form" ref={formRef} onSubmit={submit}>
      <label className="field">
        <span className="field-label">Tên cơ sở</span>
        <span className="input-ico"><Building2 size={16} />
          <input className="input" placeholder="vd: Mây Homestay" value={f.wsName} onChange={set('wsName')} autoComplete="organization" />
        </span>
      </label>
      <label className="field">
        <span className="field-label">Họ tên</span>
        <span className="input-ico"><User size={16} /><input className="input" placeholder="vd: Nguyễn Lan" value={f.name} onChange={set('name')} autoComplete="name" /></span>
      </label>
      <label className="field">
        <span className="field-label">Số điện thoại (dùng để đăng nhập)</span>
        <span className="input-ico"><Bell size={16} /><input className="input" type="tel" inputMode="tel" placeholder="0912 345 678" value={f.phone} onChange={set('phone')} autoComplete="tel" /></span>
      </label>
      <label className="field">
        <span className="field-label">Mật khẩu</span>
        <span className="input-ico pw"><Lock size={16} />
          <input className="input" type={show ? 'text' : 'password'} autoComplete="new-password" placeholder="Ít nhất 6 ký tự" value={f.password} onChange={set('password')} />
          <button type="button" className="pw-toggle" onClick={() => setShow(!show)} aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
        </span>
      </label>
      <label className="field">
        <span className="field-label">Nhập lại mật khẩu</span>
        <span className="input-ico"><Lock size={16} /><input className="input" type={show ? 'text' : 'password'} autoComplete="new-password" value={f.again} onChange={set('again')} /></span>
      </label>
      {err && <p className="form-error">{err}</p>}
      <button className="btn primary lg block" type="submit" disabled={busy}>
        {busy ? <Loader2 size={18} className="spin" /> : <Sparkles size={18} />} Tạo tài khoản dùng thử
      </button>
      <p className="tiny muted center">Miễn phí {TRIAL.days} ngày · tối đa {TRIAL.maxRooms} phòng, {TRIAL.maxLocations} địa điểm · không cần thẻ thanh toán</p>
      <button type="button" className="link-btn center-btn" onClick={onBack}>Đã có tài khoản?{" "}<b>Đăng nhập</b></button>
    </form>
  );
}

export default function Login() {
  const { login, startDemo } = useSession();
  const [mode, setMode] = useState('login');
  // chế độ xem thử với dữ liệu mẫu chỉ còn qua đường dẫn /?demo (làm video, ảnh hướng dẫn)
  const demoLink = typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) { setErr('Nhập tên đăng nhập và mật khẩu'); return; }
    setBusy(true); setErr('');
    try { await login(username.trim(), password); } catch (e2) { setErr(e2.message); setBusy(false); }
  };

  return (
    <div className="onb onb-welcome login">
      <div className="welcome-logo"><Logo size={48} animated /></div>
      <div className="welcome-art compact" aria-hidden="true">
        <div className="wa-card violet" style={{ '--d': '.45s' }}><CalendarPlus size={24} /><span>Lịch đặt phòng</span></div>
        <div className="wa-card yellow" style={{ '--d': '.58s' }}><Sparkles size={24} /><span>Thẻ dọn phòng</span></div>
        <div className="wa-card pink" style={{ '--d': '.71s' }}><CheckCircle2 size={24} /><span>Task mỗi ngày</span></div>
      </div>
      <h1 className={mode === 'signup' ? '' : 'rise'} style={{ '--i': 9 }}>{mode === 'signup' ? 'Dùng thử Hostexa miễn phí' : 'Đăng nhập Hostexa'}</h1>
      <p className={`muted ${mode === 'signup' ? '' : 'rise'}`} style={{ '--i': 10 }}>{mode === 'signup' ? `Tạo tài khoản trong 1 phút, dùng ngay ${TRIAL.days} ngày.` : 'Dữ liệu tự đồng bộ giữa các máy mỗi 15 phút.'}</p>

      {mode === 'signup' ? <Signup onBack={() => setMode('login')} /> : <>
      <form className="login-form rise" style={{ '--i': 11 }} onSubmit={submit}>
        <label className="field">
          <span className="field-label">Tên đăng nhập</span>
          <span className="input-ico"><User size={16} />
            <input className="input" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="Tên đăng nhập hoặc số điện thoại"
              value={username} onChange={(e) => setUsername(e.target.value)} />
          </span>
        </label>
        <label className="field">
          <span className="field-label">Mật khẩu</span>
          <span className="input-ico pw"><Lock size={16} />
            <input className="input" type={show ? 'text' : 'password'} autoComplete="current-password" placeholder="••••••••"
              value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" className="pw-toggle" onClick={() => setShow(!show)} aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </span>
        </label>
        {err && <p className="form-error">{err}</p>}
        <button className="btn primary lg block" type="submit" disabled={busy}>
          {busy ? <Loader2 size={18} className="spin" /> : <LogIn size={18} />} Đăng nhập
        </button>
        <p className="tiny muted center">Quên mật khẩu? Liên hệ quản trị viên để đặt lại.</p>
      </form>

      <button className="btn signup-btn lg block rise" style={{ '--i': 12 }} onClick={() => setMode('signup')}>
        <Sparkles size={18} /> Đăng ký tài khoản dùng thử miễn phí
      </button>
      {demoLink && <button className="link-btn center-btn" onClick={startDemo}>Xem thử với dữ liệu mẫu</button>}
      </>}
    </div>
  );
}
