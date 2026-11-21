import { useCallback, useEffect, useState } from 'react';
import { Plus, KeyRound, Lock, Unlock, Trash2, Pencil, Loader2, Check, X, ShieldCheck, Sparkles } from 'lucide-react';
import { useSession } from '../lib/session.jsx';
import { ROLE_LABEL } from '../lib/perm.js';
import { Sheet, toast } from './ui.jsx';
import { CredentialsSheet } from './Credentials.jsx';

const TONES = ['violet', 'yellow', 'pink', 'blue'];

function AccountRow({ a, ws, act }) {
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(a.name);
  const [username, setUsername] = useState(a.username);
  if (edit) {
    return (
      <div className="acc-row editing">
        <input className="input sm" value={name} onChange={(e) => setName(e.target.value)} aria-label="Tên hiển thị" placeholder="Tên nhân viên" />
        <input className="input sm mono" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} aria-label="Tên đăng nhập" />
        <div className="row gap8">
          <button className="btn tiny" onClick={async () => { if (await act('update-account', { id: a.id, name, username })) setEdit(false); }}><Check size={14} /> Lưu</button>
          <button className="btn tiny" onClick={() => { setEdit(false); setName(a.name); setUsername(a.username); }}><X size={14} /> Huỷ</button>
        </div>
      </div>
    );
  }
  return (
    <div className={`acc-row ${a.disabled ? 'disabled' : ''}`}>
      <span className={`role-badge r-${a.role}`}>{a.role === 'admin' ? <ShieldCheck size={13} /> : <Sparkles size={13} />}{ROLE_LABEL[a.role]}</span>
      <div className="acc-main">
        <b>{a.name}</b>
        <small className="mono">{a.username}{a.disabled ? ' · đã khoá' : ''}</small>
      </div>
      <div className="acc-actions">
        <button className="icon-btn sm" onClick={() => setEdit(true)} aria-label={`Sửa ${a.username}`}><Pencil size={15} /></button>
        <button className="icon-btn sm" onClick={() => act('reset-password', { id: a.id }, { cred: true, ws })} aria-label={`Đặt lại mật khẩu ${a.username}`}><KeyRound size={15} /></button>
        <button className="icon-btn sm" onClick={() => act('update-account', { id: a.id, disabled: !a.disabled })} aria-label={a.disabled ? `Mở khoá ${a.username}` : `Khoá ${a.username}`}>
          {a.disabled ? <Unlock size={15} /> : <Lock size={15} />}
        </button>
        <button className="icon-btn sm danger" onClick={() => { if (confirm(`Xoá tài khoản ${a.username}?`)) act('delete-account', { id: a.id }); }} aria-label={`Xoá ${a.username}`}><Trash2 size={15} /></button>
      </div>
    </div>
  );
}

/** Quản lý cơ sở & tài khoản — chỉ chủ hệ thống */
export function AdminSheet({ onClose }) {
  const { call, refresh } = useSession();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [cred, setCred] = useState(null);
  const [busy, setBusy] = useState(false);
  const [newWs, setNewWs] = useState('');
  const [memberName, setMemberName] = useState({});
  const [renaming, setRenaming] = useState(null);

  const load = useCallback(async () => {
    try { setData(await call('/api/admin')); setErr(''); } catch (e) { setErr(e.message); }
  }, [call]);
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (action, body, { cred: showCred, ws } = {}) => {
    setBusy(true);
    try {
      const r = await call('/api/admin', { method: 'POST', body: { action, ...body } });
      if (showCred && r.password) setCred({ account: r.account, password: r.password, workspaceName: ws?.name || r.workspace?.name });
      await load();
      if (action.endsWith('-ws')) refresh();
      setBusy(false);
      return true;
    } catch (e) { toast(e.message); setBusy(false); return false; }
  };

  return (
    <Sheet open onClose={onClose} title="Quản lý tài khoản">
      {err && <p className="form-error">{err}</p>}
      {!data && !err && <div className="empty-card"><Loader2 className="spin" size={20} /><p>Đang tải…</p></div>}
      {data && (
        <div className="admin">
          <form className="add-ws" onSubmit={async (e) => { e.preventDefault(); if (newWs.trim() && await act('create-ws', { name: newWs.trim() }, { cred: true })) setNewWs(''); }}>
            <input className="input" placeholder="Tên cơ sở mới" value={newWs} onChange={(e) => setNewWs(e.target.value)} aria-label="Tên cơ sở mới" />
            <button className="btn primary" type="submit" disabled={busy || !newWs.trim()}><Plus size={16} /> Tạo cơ sở</button>
          </form>
          {data.workspaces.length === 0 && <p className="tiny muted">Chưa có cơ sở nào.</p>}
          {data.workspaces.map((w, i) => {
            const accs = data.accounts.filter((a) => a.ws === w.id).sort((a, b) => (a.role === b.role ? a.createdAt - b.createdAt : a.role === 'admin' ? -1 : 1));
            return (
              <section key={w.id} className={`admin-ws tone-${TONES[i % 4]}`}>
                <div className="admin-ws-head">
                  {renaming?.id === w.id ? (
                    <form className="add-ws" onSubmit={async (e) => { e.preventDefault(); if (await act('rename-ws', { id: w.id, name: renaming.name })) setRenaming(null); }}>
                      <input className="input sm" autoFocus value={renaming.name} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} aria-label="Tên cơ sở" />
                      <button className="btn tiny" type="submit"><Check size={14} /></button>
                    </form>
                  ) : (
                    <>
                      <div><b>{w.name}</b><small>{accs.length} tài khoản · mã {w.slug}</small></div>
                      <div className="row gap8">
                        <button className="icon-btn sm" onClick={() => setRenaming({ id: w.id, name: w.name })} aria-label={`Đổi tên ${w.name}`}><Pencil size={15} /></button>
                        <button className="icon-btn sm danger" onClick={() => { if (confirm(`Xoá cơ sở "${w.name}" cùng TOÀN BỘ dữ liệu và tài khoản của cơ sở? Không thể hoàn tác.`)) act('delete-ws', { id: w.id }); }} aria-label={`Xoá ${w.name}`}><Trash2 size={15} /></button>
                      </div>
                    </>
                  )}
                </div>
                <div className="acc-list">
                  {accs.map((a) => <AccountRow key={a.id} a={a} ws={w} act={act} />)}
                </div>
                <form className="add-member" onSubmit={async (e) => {
                  e.preventDefault();
                  if (await act('add-account', { ws: w.id, role: 'member', name: memberName[w.id] || '' }, { cred: true, ws: w })) setMemberName({ ...memberName, [w.id]: '' });
                }}>
                  <input className="input sm" placeholder="Tên nhân viên dọn phòng" value={memberName[w.id] || ''} onChange={(e) => setMemberName({ ...memberName, [w.id]: e.target.value })} aria-label="Tên nhân viên" />
                  <button className="btn tiny" type="submit" disabled={busy}><Plus size={14} /> Thêm member</button>
                  <button className="btn tiny" type="button" disabled={busy} onClick={() => act('add-account', { ws: w.id, role: 'admin' }, { cred: true, ws: w })}><Plus size={14} /> Admin</button>
                </form>
              </section>
            );
          })}
        </div>
      )}
      <CredentialsSheet data={cred} onClose={() => setCred(null)} />
    </Sheet>
  );
}
