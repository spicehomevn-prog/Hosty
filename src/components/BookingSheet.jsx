import { useEffect, useState } from 'react';
import { Trash2, LogIn, LogOut, Moon, Ban, Revenue, Pencil } from '../lib/icons.jsx';
import { useStore, uid, PLATFORMS, platformColor } from '../lib/store.jsx';
import { roomIndex } from '../lib/derive.js';
import { todayKey, addDays, diffDays, longDate } from '../lib/dates.js';
import { Sheet, Field, toast, MoneyInput, DiscountInput } from './ui.jsx';
import { can } from '../lib/perm.js';
import { useFinance } from '../lib/finance.jsx';
import { bookingPrice, SOURCE_LABEL, feePct, applyDiscount, directEstimate } from '../lib/fin.js';
import { dm as dmShort, toKey } from '../lib/dates.js';
import { fmtVND } from '../lib/money.js';
import { PriceSheet } from './FinanceSheets.jsx';
import { PaymentFields } from './PaymentFields.jsx';
import { LockedRow } from './Upgrade.jsx';
import { useSession } from '../lib/session.jsx';

export function BookingSheet({ mode, data, onClose }) {
  if (mode === 'new' || (mode === 'edit')) return <ManualForm data={data} onClose={onClose} />;
  return <BookingDetail b={data} onClose={onClose} />;
}

function BookingDetail({ b, onClose }) {
  const { state, dispatch, role } = useStore();
  const finance = useFinance();
  const { plan: pl, role: rl } = useSession();
  const finLocked = !pl.has('finance') && can(rl, 'finance');
  const [edit, setEdit] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);
  const canEdit = can(role, 'booking');
  const info = roomIndex(state)[b.roomId];
  if (edit) return <ManualForm data={state.manual.find((m) => m.id === b.id) || b} onClose={onClose} />;
  const nights = diffDays(b.start, b.end);
  return (
    <Sheet open onClose={onClose} title="Chi tiết đặt phòng"
      footer={!canEdit ? null : b.source === 'manual' ? (
        <>
          <button className="icon-btn danger" onClick={() => { dispatch({ type: 'DELETE_MANUAL', id: b.id }); finance?.dispatch({ type: 'PRICE', id: b.id, entry: null }); toast('Đã xoá đặt phòng'); onClose(); }} aria-label="Xoá"><Trash2 size={18} /></button>
          <button className="btn primary block" onClick={() => setEdit(true)}>Sửa đặt phòng</button>
        </>
      ) : (
        <button className="btn ghost block" onClick={() => { dispatch({ type: 'SET_OVERRIDE', id: b.id, patch: { blocked: !b.blocked } }); onClose(); }}>
          <Ban size={16} /> {b.blocked ? 'Đây là đặt phòng thật (cần dọn)' : 'Đánh dấu là khoá phòng (không dọn)'}
        </button>
      )}>
      <div className="bk-head" style={{ '--bc': b.color }}>
        <span className="bk-platform">{b.blocked ? 'Khoá phòng' : b.platform}</span>
        <h3>{info?.room.name}</h3>
        <p>{info?.location.name}{info?.location.address ? ` · ${info.location.address}` : ''}</p>
      </div>
      <div className="bk-grid">
        <div><LogIn size={16} /><span>Nhận phòng</span><b>{longDate(b.start)}</b><em>{b.checkIn}</em></div>
        <div><LogOut size={16} /><span>Trả phòng</span><b>{longDate(b.end)}</b><em>{b.checkOut}</em></div>
        <div><Moon size={16} /><span>Số đêm</span><b>{nights} đêm</b></div>
      </div>
      {finance && !b.blocked && <PriceBlock b={b} finance={finance} onEdit={() => (b.source === 'manual' ? setEdit(true) : setPriceOpen(true))} />}
      {!finance && !b.blocked && finLocked && <LockedRow feature="finance" title="Giá & thanh toán" sub="Giá phòng, phí sàn, đặt cọc, còn phải thu" />}
      {priceOpen && <PriceSheet b={b} onClose={() => setPriceOpen(false)} />}
      {(b.summary || b.description) && (
        <div className="bk-desc">
          {b.summary && <b>{b.summary}</b>}
          {b.description && <pre>{b.description}</pre>}
        </div>
      )}
    </Sheet>
  );
}

function PriceBlock({ b, finance, onEdit }) {
  const p = bookingPrice(b, finance.fin);
  const ro = !!finance.readOnly; // nhân viên: chỉ xem giá
  if (p.missing) {
    if (ro) return <div className="bk-price missing"><span className="bk-price-ico"><Revenue size={20} /></span><span><b>Chưa có giá</b><small>Admin chưa nhập giá cho đặt phòng này</small></span></div>;
    return (
      <button className="bk-price missing" onClick={onEdit}>
        <span className="bk-price-ico"><Revenue size={20} /></span>
        <span><b>Chưa có giá</b><small>Phòng chưa có bảng giá cho các đêm này · bấm để nhập</small></span>
        <span className="btn tiny">Nhập giá</span>
      </button>
    );
  }
  return (
    <div className="bk-price">
      {p.discountTotal > 0 && (
        <div className="bk-price-disc">
          <span>Giá gốc <s>{fmtVND(p.base)}</s></span>
          <span>Giảm <b>−{fmtVND(p.discountTotal)}</b>{p.entry?.discount?.type === 'pct' ? ` (${p.entry.discount.value}%)` : ''}</span>
        </div>
      )}
      <div className="bk-price-grid">
        <div><span>{p.discountTotal > 0 ? 'Sau giảm' : 'Giá phòng'}</span><b>{fmtVND(p.amount)}</b></div>
        <div><span>Phí sàn{p.entry?.fee == null ? ` (${feePct(finance.fin, b.platform)}%)` : ''}</span><b>{p.fee ? `−${fmtVND(p.fee)}` : fmtVND(0)}</b></div>
        <div className="net"><span>Thực nhận{p.extras > 0 ? ' (gồm DV)' : ''}</span><b>{fmtVND(p.net)}</b></div>
      </div>
      {b.source === 'manual' && p.entry && <PayBlock p={p} b={b} finance={finance} />}
      <div className="bk-price-foot">
        <small>{SOURCE_LABEL[p.source]}{p.estimated ? ' · ước tính' : ''}{ro ? ' · chỉ xem' : ''}</small>
        {!ro && <button className="link" onClick={onEdit}><Pencil size={14} /> Sửa giá</button>}
      </div>
    </div>
  );
}

function PayBlock({ p, b, finance }) {
  const e = p.entry;
  const toggle = () => finance.dispatch({ type: 'PRICE', id: b.id, entry: e.paidAt ? (({ paidAt, ...r }) => r)(e) : { ...e, paidAt: Date.now() } }); // eslint-disable-line no-unused-vars
  return (
    <div className="pay-block">
      {(e.extras || []).map((x) => (
        <div key={x.id} className="pay-line"><span>{x.name}{x.qty > 1 ? ` × ${x.qty}` : ''}</span><b>{fmtVND(x.price * (x.qty || 1))}</b></div>
      ))}
      <div className="pay-line sum"><span>Tổng tiền</span><b>{fmtVND(p.total)}</b></div>
      {p.deposit > 0 && <div className="pay-line"><span>Đã cọc{e.depositNote ? ` (${e.depositNote.toLowerCase()})` : ''}</span><b>−{fmtVND(p.deposit)}</b></div>}
      <div className={`pay-line due ${e.paidAt ? 'paid' : ''}`}>
        <span>{e.paidAt ? `Đã thu đủ ${dmShort(toKey(new Date(e.paidAt)))}` : 'Còn phải thu'}</span>
        <b>{fmtVND(e.paidAt ? 0 : p.due)}</b>
      </div>
      {!finance.readOnly && (p.due > 0 || e.paidAt) && (
        <button className={`btn tiny pay-toggle ${e.paidAt ? '' : 'go'}`} onClick={toggle}>{e.paidAt ? 'Bỏ đánh dấu đã thu' : '✓ Đã thu đủ'}</button>
      )}
    </div>
  );
}

function ManualForm({ data, onClose }) {
  const { state, dispatch, user } = useStore();
  const finance = useFinance();
  const { plan: pl, role: rl } = useSession();
  const finLocked = !pl.has('finance') && can(rl, 'finance');
  const oldEntry = data?.id ? finance?.fin.prices?.[data.id] : null;
  const [price, setPrice] = useState(() => (oldEntry ? oldEntry.base ?? oldEntry.amount ?? null : null));
  const [discount, setDiscount] = useState(() => oldEntry?.discount || null);
  const pay = applyDiscount(price, discount);
  const [extras, setExtras] = useState(() => oldEntry?.extras || []);
  const [deposit, setDeposit] = useState(() => oldEntry?.deposit ?? null);
  const [method, setMethod] = useState(() => oldEntry?.depositNote || '');
  const firstRoom = state.locations[0]?.rooms[0]?.id || '';
  const t = todayKey();
  const [f, setF] = useState({
    roomId: firstRoom, platform: 'Trực tiếp', guest: '', start: t, end: addDays(t, 1), checkIn: '14:00', checkOut: '12:00', note: '',
    ...data,
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const needPrice = !!finance;
  // Giá tự điền theo bảng giá Trực tiếp (Bảng giá → Trực tiếp) cho tới khi người dùng tự gõ giá
  const [auto, setAuto] = useState(!oldEntry);
  const est = needPrice && f.platform === 'Trực tiếp' ? directEstimate(finance.fin, f.roomId, f.start, f.end) : null;
  useEffect(() => { if (auto) setPrice(est); }, [auto, est]);
  const typePrice = (v) => { setAuto(false); setPrice(v); };
  const priceOk = !needPrice || (price != null && price > 0);
  const valid = f.roomId && f.start && f.end && f.end > f.start && priceOk;
  const save = () => {
    if (!valid) return;
    const { summary, description, blocked, source, color, calendarId, ...clean } = f; // eslint-disable-line no-unused-vars
    const id = f.id || uid();
    dispatch({ type: 'SAVE_MANUAL', booking: { ...clean, id } });
    if (finance) {
      const old = finance.fin.prices?.[id];
      const { base, discount: _d, extras: _x, deposit: _p, depositNote: _n, ...rest } = old || {}; // eslint-disable-line no-unused-vars
      const disc = discount?.value ? discount : null;
      const ex = extras.filter((x) => x.name.trim() && x.price > 0).map((x) => ({ ...x, name: x.name.trim(), qty: x.qty || 1 }));
      finance.dispatch({
        type: 'PRICE', id,
        entry: {
          ...rest, roomId: f.roomId, platform: f.platform, guest: f.guest, start: f.start, end: f.end, amount: pay,
          ...(disc ? { base: price, discount: disc } : {}), ...(ex.length ? { extras: ex } : {}),
          ...(deposit > 0 ? { deposit, ...(method ? { depositNote: method } : {}) } : {}),
          source: 'manual', at: Date.now(), by: user?.name || '',
        },
      });
    }
    toast('Đã lưu đặt phòng');
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title={f.id ? 'Sửa đặt phòng' : 'Thêm đặt phòng'}
      footer={<button className="btn primary block" onClick={save} disabled={!valid}>Lưu đặt phòng</button>}>
      <Field label="Phòng">
        <select className="input" value={f.roomId} onChange={set('roomId')}>
          {state.locations.map((l) => (
            <optgroup key={l.id} label={l.name}>{l.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</optgroup>
          ))}
        </select>
      </Field>
      <Field label="Tên khách / SĐT"><input className="input" value={f.guest} onChange={set('guest')} placeholder="VD: Anh Minh – 0909 123 456" /></Field>
      <Field label="Nguồn">
        <div className="chip-row">
          {PLATFORMS.map((p) => (
            <button key={p.name} type="button" className={`mini-chip ${f.platform === p.name ? 'on' : ''}`} style={{ '--pc': platformColor(p.name) }} onClick={() => setF({ ...f, platform: p.name })}>{p.name}</button>
          ))}
        </div>
      </Field>
      {!needPrice && finLocked && <LockedRow feature="finance" title="Giá & thanh toán" sub="Giá phòng, giảm giá, dịch vụ, đặt cọc, còn phải thu" />}
      {needPrice && (
        <>
        <Field label={<>Giá phòng (trước giảm giá) <em className="req">*</em></>} hint={!priceOk ? null : `${diffDays(f.start, f.end) > 0 ? `${diffDays(f.start, f.end)} đêm · ` : ''}${f.platform !== 'Trực tiếp' ? `phí sàn ${feePct(finance.fin, f.platform)}%` : 'không mất phí sàn'}`}>
          <MoneyInput value={price} onChange={typePrice} placeholder="VD: 1.200.000" invalid={!priceOk} />
          {auto && est != null && <span className="tiny muted auto-note">Tự điền theo bảng giá Trực tiếp · sửa được</span>}
          {!priceOk && <span className="field-error">Bắt buộc nhập giá phòng để tạo đặt phòng</span>}
        </Field>
        <Field label="Giảm giá (không bắt buộc)"><DiscountInput value={discount} onChange={setDiscount} /></Field>
        {priceOk && price !== pay && <p className="tiny muted pay-note">Đã giảm {fmtVND(price - pay)} · tiền phòng còn {fmtVND(pay)}</p>}
        <PaymentFields room={priceOk ? pay : 0} extras={extras} setExtras={setExtras} deposit={deposit} setDeposit={setDeposit} method={method} setMethod={setMethod} />
        </>
      )}
      <div className="grid2">
        <Field label="Ngày nhận"><input type="date" className="input" value={f.start} onChange={set('start')} /></Field>
        <Field label="Ngày trả"><input type="date" className="input" value={f.end} min={addDays(f.start, 1)} onChange={set('end')} /></Field>
        <Field label="Giờ nhận"><input type="time" className="input" value={f.checkIn} onChange={set('checkIn')} /></Field>
        <Field label="Giờ trả"><input type="time" className="input" value={f.checkOut} onChange={set('checkOut')} /></Field>
      </div>
      {f.end <= f.start && <p className="form-error">Ngày trả phải sau ngày nhận.</p>}
      <Field label="Ghi chú"><textarea className="input" rows={2} value={f.note} onChange={set('note')} placeholder="Yêu cầu đặc biệt, tiền cọc…" /></Field>
    </Sheet>
  );
}
