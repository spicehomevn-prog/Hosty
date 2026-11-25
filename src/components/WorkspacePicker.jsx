import { useState } from 'react';
import { Building2, Plus, LogOut, ChevronRight, Loader2, Users } from '../lib/icons.jsx';
import { useSession } from '../lib/session.jsx';
import { roleLabel } from '../lib/perm.js';
import { Logo } from './Logo.jsx';
import { CredentialsSheet } from './Credentials.jsx';
import { AdminSheet } from './Admin.jsx';

const TONES = ['violet', 'yellow', 'pink', 'blue'];

export default function WorkspacePicker() {
  const { user, role, workspaces, selectWs, logout, call, refresh } = useSession();
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [cred, setCred] = useState(null);
  const [adminOpen, setAdminOpen] = useState(false);

  const create = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true); setErr('');
    try {
      const r = await call('/api/admin', { method: 'POST', body: { action: 'create-ws', name: name.trim() } });
      await refresh();
      setCred({ account: r.account, password: r.password, workspaceName: r.workspace.name });
      setName(''); setAdding(false);
    } catch (e2) { setErr(e2.message); }
    setBusy(false);
  };

  return (
    <div className="onb picker">
      <header className="picker-top rise">
        <Logo size={36} />
        <button className="icon-btn" onClick={logout} aria-label="Đăng xuất"><LogOut size={18} /></button>
      </header>
      <h1 className="rise" style={{ '--i': 1 }}>Xin chào, {user?.name}</h1>
      <p className="sub rise" style={{ '--i': 2 }}>{roleLabel(role, user?.kind)} · chọn cơ sở để làm việc</p>

      <div className="ws-list stagger" style={{ '--i': 3 }}>
        {workspaces.map((w, i) => (
          <button key={w.id} className={`ws-card tone-${TONES[i % 4]}`} onClick={() => selectWs(w.id)}>
            <span className="emoji-box lg"><Building2 size={26} /></span>
            <span className="loc-info"><b>{w.name}</b><small>Mở dữ liệu cơ sở</small></span>
            <ChevronRight size={20} />
          </button>
        ))}
        {workspaces.length === 0 && (
          <div className="empty-card">
            <p>{role === 'owner' ? 'Chưa có cơ sở nào. Tạo cơ sở đầu tiên để bắt đầu.' : 'Tài khoản chưa được gán cơ sở. Liên hệ quản trị viên.'}</p>
          </div>
        )}
      </div>

      {role === 'owner' && (
        <div className="rise" style={{ '--i': 5 }}>
          {adding ? (
            <form className="add-ws" onSubmit={create}>
              <input className="input" autoFocus placeholder="Tên cơ sở, vd: Mây Homestay" value={name} onChange={(e) => setName(e.target.value)} />
              <button className="btn primary" type="submit" disabled={busy || !name.trim()}>{busy ? <Loader2 size={16} className="spin" /> : <Plus size={16} />} Tạo</button>
            </form>
          ) : (
            <button className="btn ghost block" onClick={() => setAdding(true)}><Plus size={16} /> Tạo cơ sở mới</button>
          )}
          {err && <p className="form-error">{err}</p>}
          <p className="tiny muted" style={{ marginTop: 8 }}>Mỗi cơ sở có dữ liệu riêng. Khi tạo cơ sở, Hostexa tự tạo tài khoản admin cho cơ sở đó.</p>
          <button className="btn ghost block" style={{ marginTop: 14 }} onClick={() => setAdminOpen(true)}><Users size={16} /> Quản lý tài khoản</button>
        </div>
      )}

      <CredentialsSheet data={cred} onClose={() => setCred(null)} />
      {adminOpen && <AdminSheet onClose={() => setAdminOpen(false)} />}
    </div>
  );
}
