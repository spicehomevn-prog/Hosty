import { useState } from 'react';
import { Cloud, CloudOff, RefreshCw, AlertTriangle, LogOut, KeyRound, ArrowLeftRight, Users, Loader2, CheckCircle2 } from '../lib/icons.jsx';
import { useSession } from '../lib/session.jsx';
import { useStore } from '../lib/store.jsx';
import { roleLabel, KINDS, kindOf, assignedLocations } from '../lib/perm.js';
import { timeAgo } from '../lib/dates.js';
import { Sheet, Field, toast } from './ui.jsx';
import { AdminSheet, KindPick } from './Admin.jsx';
import { openUpgrade } from './Upgrade.jsx';
import { useMembers } from '../lib/members.js';
import { Lock, Copy, Trash2, Plus } from '../lib/icons.jsx';

/** Admin cơ sở tự thêm / xoá nhân viên dọn phòng, tối đa theo gói (dùng thử 1, Cơ bản 2, Nâng cao 5, Cao cấp 10, VIP không giới hạn) */
/** Chọn địa điểm được giao cho nhân viên: "Tất cả" hoặc một / nhiều địa điểm (chỉ hiện khi cơ sở có > 1 địa điểm) */
export function LocPick({ value, locations, onChange }) {
  const all = !value.length;
  const toggle = (id) => {
    const next = all ? [id] : value.includes(id) ? value.filter((x) => x !== id) : [...value, id];
    onChange(next.length === locations.length ? [] : next);
  };
  return (
    <div className="loc-pick" role="group" aria-label="Địa điểm được giao">
      <span className="loc-pick-label">Địa điểm:</span>
      <button type="button" className={all ? 'on' : ''} aria-pressed={all} onClick={() => onChange([])}>Tất cả</button>
      {locations.map((l) => (
        <button key={l.id} type="button" className={!all && value.includes(l.id) ? 'on' : ''} aria-pressed={!all && value.includes(l.id)} onClick={() => toggle(l.id)}>{l.name}</button>
      ))}
    </div>
  );
}

function PlanMembers() {
  const s = useSession();
  const { state } = useStore();
  const locations = state.locations || [];
  const max = s.plan.limits.maxMembers;
  const members = useMembers().filter((m) => m.role === 'member');
  const [name, setName] = useState('');
  const [kind, setKind] = useState('cleaner');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);
  const [err, setErr] = useState('');
  const [list, setList] = useState(null); // danh sách sau khi thêm / xoá (khỏi chờ tải lại)
  const shown = list || members;
  const add = async () => {
    if (shown.length >= max) { openUpgrade('members'); return; }
    setBusy(true); setErr('');
    try {
      const r = await s.call('/api/auth', { method: 'POST', body: { action: 'add-member', ws: s.workspace.id, name: name.trim(), kind } });
      setCreated(r); setName(''); setList([...shown, r.account]);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const remove = async (m) => {
    if (!confirm(`Xoá tài khoản ${m.name}? Nhân viên này sẽ không đăng nhập được nữa.`)) return;
    try { await s.call('/api/auth', { method: 'POST', body: { action: 'remove-member', ws: s.workspace.id, id: m.id } }); setList(shown.filter((x) => x.id !== m.id)); setCreated(null); } catch (e) { setErr(e.message); }
  };
  const setKindOf = async (m, k) => {
    if (kindOf(m) === k) return;
    try { await s.call('/api/auth', { method: 'POST', body: { action: 'set-kind', ws: s.workspace.id, id: m.id, kind: k } }); setList(shown.map((x) => (x.id === m.id ? { ...x, kind: k } : x))); toast(`Đã đổi thành ${KINDS[k]}`); } catch (e) { setErr(e.message); }
  };
  const setLocsOf = async (m, locs) => {
    try {
      const r = await s.call('/api/auth', { method: 'POST', body: { action: 'set-locations', ws: s.workspace.id, id: m.id, locations: locs } });
      setList(shown.map((x) => (x.id === m.id ? { ...x, locations: r.locations } : x)));
      toast(r.locations.length ? `${m.name}: ${r.locations.length} địa điểm` : `${m.name}: tất cả địa điểm`);
    } catch (e) { setErr(e.message); }
  };
  const copy = async () => {
    const t = `Tài khoản Hostexa của bạn:\nTrang: https://hostexa.vercel.app\nTên đăng nhập: ${created.account.username}\nMật khẩu: ${created.password}`;
    try { await navigator.clipboard.writeText(t); toast('Đã copy – dán vào Zalo gửi nhân viên'); } catch { toast(t); }
  };
  return (
    <div className="trial-members">
      <div className="row-between"><b>Nhân viên &amp; dọn phòng</b><span className="tiny muted">{Number.isFinite(max) ? `${shown.length}/${max}` : shown.length}</span></div>
      {shown.map((m) => (
        <div key={m.id} className="tm-row">
          <span><b>{m.name}</b><small className="mono">{m.username}</small>
            <KindPick value={kindOf(m)} size={12} onChange={(k) => setKindOf(m, k)} />
            {locations.length > 1 && <LocPick value={assignedLocations(m)} locations={locations} onChange={(l) => setLocsOf(m, l)} />}
          </span>
          <button className="icon-btn sm danger" onClick={() => remove(m)} aria-label={`Xoá ${m.name}`}><Trash2 size={16} /></button>
        </div>
      ))}
      {created && (
        <div className="tm-created">
          <span>Tên đăng nhập <b className="mono">{created.account.username}</b> · Mật khẩu <b className="mono">{created.password}</b></span>
          <button className="btn tiny" onClick={copy}><Copy size={14} /> Copy gửi Zalo</button>
        </div>
      )}
      {shown.length < max ? (
        <div className="tm-add">
          <KindPick value={kind} onChange={setKind} />
          <input className="input sm" placeholder={kind === 'staff' ? 'Tên nhân viên' : 'Tên nhân viên dọn phòng'} value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn tiny primary" onClick={add} disabled={busy}>{busy ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} Thêm</button>
        </div>
      ) : (
        <button className="btn tiny" onClick={() => openUpgrade('members')}><Lock size={14} /> Thêm nhân viên (nâng cấp gói)</button>
      )}
      {err && <p className="form-error">{err}</p>}
    </div>
  );
}

/** Nhãn gói của cơ sở: tên gói, hạn dùng; bấm để gia hạn / nâng cấp */
function PlanPill({ plan }) {
  const soon = plan.daysLeft != null && plan.daysLeft <= 5;
  const end = plan.ends ? new Date(plan.ends).toLocaleDateString('vi-VN') : '';
  let text;
  if (plan.expired) text = plan.trial ? 'Hết hạn dùng thử – chỉ xem' : `Gói ${plan.name} đã hết hạn ${end} – chỉ xem`;
  else if (plan.trial) text = `Dùng thử · còn ${plan.daysLeft} ngày`;
  else if (plan.vip) text = 'Tài khoản VIP · đủ tính năng';
  else text = `Gói ${plan.name}${end ? ` · dùng tới ${end}` : ''}${soon ? ` (còn ${plan.daysLeft} ngày)` : ''}`;
  const cta = plan.vip ? '' : plan.trial ? 'Chọn gói' : plan.expired || soon ? 'Gia hạn' : 'Đổi gói';
  return (
    <button className={`trial-pill ${plan.expired ? 'bad' : ''} ${!plan.trial && !plan.expired ? 'paid' : ''} ${soon && !plan.expired ? 'soon' : ''}`}
      onClick={() => !plan.vip && openUpgrade(null)} disabled={plan.vip}>
      {plan.trial || plan.expired ? <Lock size={14} /> : <CheckCircle2 size={14} />} {text}{cta && <> · <b>{cta}</b></>}
    </button>
  );
}

/** Dòng trạng thái đồng bộ */
export function SyncStatus({ compact }) {
  const { cloud } = useStore();
  if (!cloud.enabled) return <span className="sync-pill local">Xem thử · không đồng bộ</span>;
  let icon = <CheckCircle2 size={14} />;
  let text = `Đã đồng bộ ${timeAgo(cloud.at)}`;
  let cls = 'ok';
  if (cloud.status === 'syncing') { icon = <Loader2 size={14} className="spin" />; text = 'Đang đồng bộ…'; cls = 'busy'; }
  else if (cloud.status === 'offline') { icon = <CloudOff size={14} />; text = 'Ngoại tuyến · sẽ đồng bộ khi có mạng'; cls = 'warn'; }
  else if (cloud.status === 'error') { icon = <AlertTriangle size={14} />; text = compact ? 'Lỗi đồng bộ · thử lại' : cloud.error || 'Lỗi đồng bộ'; cls = 'bad'; }
  else if (cloud.dirty) { icon = <Cloud size={14} />; text = 'Có thay đổi chờ đồng bộ'; cls = 'busy'; }
  return (
    <button className={`sync-pill ${cls}`} onClick={() => cloud.syncNow()} title="Đồng bộ ngay">
      {icon}<span>{text}</span>
    </button>
  );
}

function ChangePassword({ onClose }) {
  const { call, setToken } = useSession();
  const [f, setF] = useState({ oldPassword: '', newPassword: '', again: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (f.newPassword.length < 6) return setErr('Mật khẩu mới cần ít nhất 6 ký tự');
    if (f.newPassword !== f.again) return setErr('Nhập lại mật khẩu mới chưa khớp');
    setBusy(true); setErr('');
    try {
      const r = await call('/api/auth', { method: 'POST', body: { action: 'change-password', oldPassword: f.oldPassword, newPassword: f.newPassword } });
      setToken(r.token);
      toast('Đã đổi mật khẩu');
      onClose();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Sheet open onClose={onClose} title="Đổi mật khẩu"
      footer={<button className="btn primary block" onClick={save} disabled={busy}>{busy && <Loader2 size={16} className="spin" />} Lưu mật khẩu</button>}>
      <Field label="Mật khẩu hiện tại"><input className="input" type="password" autoComplete="current-password" value={f.oldPassword} onChange={set('oldPassword')} /></Field>
      <Field label="Mật khẩu mới" hint="Ít nhất 6 ký tự"><input className="input" type="password" autoComplete="new-password" value={f.newPassword} onChange={set('newPassword')} /></Field>
      <Field label="Nhập lại mật khẩu mới"><input className="input" type="password" autoComplete="new-password" value={f.again} onChange={set('again')} /></Field>
      {err && <p className="form-error">{err}</p>}
      <p className="tiny muted">Đổi mật khẩu sẽ đăng xuất tài khoản này trên các máy khác.</p>
    </Sheet>
  );
}

/** Thẻ tài khoản ở trang Cơ sở */
export function AccountCard() {
  const s = useSession();
  const { cloud } = useStore();
  const [pw, setPw] = useState(false);
  const [admin, setAdmin] = useState(false);

  if (s.role === 'demo') {
    return (
      <div className="account-card">
        <div className="acc-head"><span className="acc-avatar">?</span><div><b>Chế độ xem thử</b><small>Dữ liệu mẫu chỉ nằm trên máy này</small></div></div>
        <button className="btn primary block" onClick={s.logout}><LogOut size={16} /> Thoát & đăng nhập</button>
      </div>
    );
  }

  const logout = async () => {
    if (cloud.dirty) {
      const ok = await cloud.syncNow();
      if (!ok && !confirm('Còn thay đổi chưa đồng bộ được lên máy chủ. Đăng xuất sẽ mất các thay đổi này. Vẫn đăng xuất?')) return;
    }
    s.logout();
  };

  return (
    <div className="account-card">
      <div className="acc-head">
        <span className="acc-avatar">{(s.user?.name || '?').trim().slice(0, 1).toUpperCase()}</span>
        <div>
          <b>{s.user?.name}</b>
          <small><span className="mono">{s.user?.username}</span> · {roleLabel(s.role, s.user?.kind)}</small>
        </div>
      </div>
      <div className="acc-ws">
        <span>Cơ sở đang mở</span>
        <b>{s.workspace?.name}</b>
      </div>
      {s.role !== 'demo' && s.workspace && <PlanPill plan={s.plan} />}
      {!s.plan.expired && (s.user?.role === 'admin' || (s.role === 'owner' && s.workspace)) && <PlanMembers />}
      <SyncStatus />
      <p className="tiny muted">Tự đồng bộ mỗi 15 phút, khi mở app, khi chuyển app xuống nền và ngay sau khi bạn sửa.</p>
      <div className="row gap8 wrap">
        <button className="btn tiny" onClick={() => cloud.syncNow()} disabled={cloud.status === 'syncing'}><RefreshCw size={14} className={cloud.status === 'syncing' ? 'spin' : ''} /> Đồng bộ ngay</button>
        {s.workspaces.length > 1 && <button className="btn tiny" onClick={() => s.selectWs(null)}><ArrowLeftRight size={14} /> Đổi cơ sở</button>}
        {s.role !== 'owner' && <button className="btn tiny" onClick={() => setPw(true)}><KeyRound size={14} /> Đổi mật khẩu</button>}
        {s.role === 'owner' && <button className="btn tiny" onClick={() => setAdmin(true)}><Users size={14} /> Quản lý tài khoản</button>}
        <button className="btn tiny danger" onClick={logout}><LogOut size={14} /> Đăng xuất</button>
      </div>
      {pw && <ChangePassword onClose={() => setPw(false)} />}
      {admin && <AdminSheet onClose={() => { setAdmin(false); s.refresh(); }} />}
    </div>
  );
}
