import { useCallback, useEffect, useState } from 'react';
import { Plus, KeyRound, Lock, Unlock, Trash2, Pencil, Loader2, Check, X, ShieldCheck, Sparkles, UserRound } from '../lib/icons.jsx';
import { useSession } from '../lib/session.jsx';
import { roleLabel, KINDS, kindOf } from '../lib/perm.js';

/** Chọn loại tài khoản thành viên: Dọn phòng (cây chổi) hoặc Nhân viên (hình người) */
export function KindPick({ value, onChange, size = 13 }) {
  return (
    <div className="seg kind-seg" role="radiogroup" aria-label="Loại tài khoản">
      {Object.entries(KINDS).map(([k, label]) => (
        <button key={k} type="button" role="radio" aria-checked={value === k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>
          {k === 'staff' ? <UserRound size={size} /> : <Sparkles size={size} />} {label}
        </button>
      ))}
    </div>
  );
}
export const KindIcon = ({ a, size = 13 }) => (a.role === 'admin' ? <ShieldCheck size={size} /> : kindOf(a) === 'staff' ? <UserRound size={size} /> : <Sparkles size={size} />);
import { Sheet, toast } from './ui.jsx';
import { CredentialsSheet } from './Credentials.jsx';
import { TRIAL, PLANS, PAID, COMBOS, comboPrice, planId, planExpired, planDaysLeft, planEnds } from '../lib/plan.js';
import { fmtVND } from '../lib/money.js';

const TONES = ['violet', 'yellow', 'pink', 'blue'];

function AccountRow({ a, ws, act }) {
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(a.name);
  const [username, setUsername] = useState(a.username);
  const [kind, setKind] = useState(kindOf(a));
  if (edit) {
    return (
      <div className="acc-row editing">
        <input className="input sm" value={name} onChange={(e) => setName(e.target.value)} aria-label="Tên hiển thị" placeholder="Tên nhân viên" />
        <input className="input sm mono" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} aria-label="Tên đăng nhập" />
        {a.role === 'member' && <KindPick value={kind} onChange={setKind} />}
        <div className="row gap8">
          <button className="btn tiny" onClick={async () => { if (await act('update-account', { id: a.id, name, username, ...(a.role === 'member' ? { kind } : {}) })) setEdit(false); }}><Check size={14} /> Lưu</button>
          <button className="btn tiny" onClick={() => { setEdit(false); setName(a.name); setUsername(a.username); setKind(kindOf(a)); }}><X size={14} /> Huỷ</button>
        </div>
      </div>
    );
  }
  return (
    <div className={`acc-row ${a.disabled ? 'disabled' : ''}`}>
      <span className={`role-badge r-${a.role}`}><KindIcon a={a} />{roleLabel(a.role, a.kind)}</span>
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
/** Gói của cơ sở: chọn gói, hạn dùng, gia hạn 1 / 3 / 6 tháng (ghi lịch sử thanh toán), người đăng ký */
function PlanRow({ w, act, busy }) {
  const id = planId(w);
  const P = PLANS[id];
  const exp = planExpired(w);
  const ends = planEnds(w);
  const left = planDaysLeft(w);
  const paid = PAID.includes(id);
  const legacy = !w.plan || w.plan === 'pro';
  const state = exp ? 'bad' : id === 'trial' ? 'trial' : 'pro';
  const setPlan = (plan) => {
    if (plan === id && !legacy) return;
    const txt = plan === 'trial' ? `Chuyển "${w.name}" về dùng thử (${TRIAL.days} ngày, tối đa ${TRIAL.maxRooms} phòng, 1 địa điểm)?`
      : plan === 'vip' ? `Đặt "${w.name}" là VIP (đủ tính năng, không giới hạn, có giá tự động từ sàn)?`
        : `Đổi "${w.name}" sang gói ${PLANS[plan].name}?${!w.paidUntil ? ' Hạn dùng đầu tiên: 1 tháng.' : ''}`;
    if (confirm(txt)) act('set-plan', { id: w.id, plan });
  };
  return (
    <div className={`plan-row ${state}`}>
      <span className="plan-tag">
        {P.name}{legacy ? ' (mặc định)' : ''}
        {exp ? ' · hết hạn' : left != null ? ` · còn ${left} ngày` : ''}
        {ends ? ` · tới ${new Date(ends).toLocaleDateString('vi-VN')}` : (paid || id === 'vip' ? ' · không hạn' : '')}
      </span>
      {w.contact && <span className="plan-contact">{w.contact.name} · <a href={`tel:${w.contact.phone}`}>{w.contact.phone}</a>{w.signupAt ? ` · đăng ký ${new Date(w.signupAt).toLocaleDateString('vi-VN')}` : ''}</span>}
      <label className="plan-pick">
        <span>Gói</span>
        <select className="input sm" value={legacy ? '' : id} disabled={busy} onChange={(e) => e.target.value && setPlan(e.target.value)}>
          {legacy && <option value="">Cao cấp (mặc định, chưa chọn)</option>}
          {['trial', ...PAID, 'vip'].map((k) => <option key={k} value={k}>{PLANS[k].name}{PLANS[k].price ? ` – ${fmtVND(PLANS[k].price)}/tháng` : ''}</option>)}
        </select>
      </label>
      <span className="row gap8 wrap">
        {id === 'trial' && <button className="btn tiny" disabled={busy} onClick={() => act('extend-trial', { id: w.id, days: TRIAL.days })}>Gia hạn dùng thử {TRIAL.days} ngày</button>}
        {paid && !legacy && COMBOS.map((c) => (
          <button key={c.months} className="btn tiny" disabled={busy}
            onClick={() => { if (confirm(`Gia hạn "${w.name}" gói ${P.name} thêm ${c.months} tháng – đã nhận ${fmtVND(comboPrice(id, c.months))}?`)) act('extend-paid', { id: w.id, months: c.months }); }}>
            +{c.months} tháng · {fmtVND(comboPrice(id, c.months))}
          </button>
        ))}
      </span>
      {w.payments?.length > 0 && (
        <span className="plan-pay tiny muted">
          Đã thu: {w.payments.slice(0, 3).map((p) => `${new Date(p.at).toLocaleDateString('vi-VN')} ${PLANS[p.plan]?.name || p.plan} ${p.months}th ${fmtVND(p.amount)}`).join(' · ')}
        </span>
      )}
    </div>
  );
}

export function AdminSheet({ onClose }) {
  const { call, refresh } = useSession();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [cred, setCred] = useState(null);
  const [busy, setBusy] = useState(false);
  const [newWs, setNewWs] = useState('');
  const [memberName, setMemberName] = useState({});
  const [memberKind, setMemberKind] = useState({});
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
      if (action.endsWith('-ws') || action === 'set-plan' || action === 'extend-trial') refresh();
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
                <PlanRow w={w} act={act} busy={busy} />
                <div className="acc-list">
                  {accs.map((a) => <AccountRow key={a.id} a={a} ws={w} act={act} />)}
                </div>
                <form className="add-member" onSubmit={async (e) => {
                  e.preventDefault();
                  if (await act('add-account', { ws: w.id, role: 'member', kind: memberKind[w.id] || 'cleaner', name: memberName[w.id] || '' }, { cred: true, ws: w })) setMemberName({ ...memberName, [w.id]: '' });
                }}>
                  <KindPick value={memberKind[w.id] || 'cleaner'} onChange={(k) => setMemberKind({ ...memberKind, [w.id]: k })} />
                  <input className="input sm" placeholder={(memberKind[w.id] || 'cleaner') === 'staff' ? 'Tên nhân viên' : 'Tên nhân viên dọn phòng'} value={memberName[w.id] || ''} onChange={(e) => setMemberName({ ...memberName, [w.id]: e.target.value })} aria-label="Tên nhân viên" />
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
