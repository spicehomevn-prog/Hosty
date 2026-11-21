import { useState } from 'react';
import { CalendarPlus, Sparkles, CheckCircle2, LogIn, Eye, EyeOff, Loader2, User, Lock } from 'lucide-react';
import { useSession } from '../lib/session.jsx';
import { Logo } from './Logo.jsx';

export default function Login() {
  const { login, startDemo } = useSession();
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
      <h1 className="rise" style={{ '--i': 9 }}>Đăng nhập Hosty</h1>
      <p className="muted rise" style={{ '--i': 10 }}>Dữ liệu tự đồng bộ giữa các máy mỗi 15 phút.</p>

      <form className="login-form rise" style={{ '--i': 11 }} onSubmit={submit}>
        <label className="field">
          <span className="field-label">Tên đăng nhập</span>
          <span className="input-ico"><User size={16} />
            <input className="input" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="vd: mayhomestay-admin"
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
        <p className="tiny muted center">Tài khoản do quản trị viên cấp. Quên mật khẩu? Liên hệ quản trị viên để đặt lại.</p>
      </form>

      <button className="link-btn center-btn rise" style={{ '--i': 12 }} onClick={startDemo}>
        Chưa có tài khoản? <b>Xem thử với dữ liệu mẫu</b>
      </button>
    </div>
  );
}
