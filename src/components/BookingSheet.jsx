import { useState } from 'react';
import { Trash2, LogIn, LogOut, Moon, Ban, Revenue, Pencil } from '../lib/icons.jsx';
import { useStore, uid, PLATFORMS, platformColor } from '../lib/store.jsx';
import { roomIndex } from '../lib/derive.js';
import { todayKey, addDays, diffDays, longDate } from '../lib/dates.js';
import { Sheet, Field, toast, MoneyInput, DiscountInput } from './ui.jsx';
import { can } from '../lib/perm.js';
import { useFinance } from '../lib/finance.jsx';
import { bookingPrice, SOURCE_LABEL, feePct, applyDiscount } from '../lib/fin.js';
import { fmtVND } from '../lib/money.js';
import { PriceSheet } from './FinanceSheets.jsx';

export function BookingSheet({ mode, data, onClose }) {
  if (mode === 'new' || (mode === 'edit')) return <ManualForm data={data} onClose={onClose} />;
  return <BookingDetail b={data} onClose={onClose} />;
}

function BookingDetail({ b, onClose }) {
  const { state, dispatch, role } = useStore();
  const finance = useFinance();
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
  if (p.missing) {
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
        <div className="net"><span>Thực nhận</span><b>{fmtVND(p.net)}</b></div>
      </div>
      <div className="bk-price-foot">
        <small>{SOURCE_LABEL[p.source]}{p.estimated ? ' · ước tính' : ''}</small>
        <button className="link" onClick={onEdit}><Pencil size={14} /> Sửa giá</button>
      </div>
    </div>
  );
}

function ManualForm({ data, onClose }) {
  const { state, dispatch, user } = useStore();
  const finance = useFinance();
  const oldEntry = data?.id ? finance?.fin.prices?.[data.id] : null;
  const [price, setPrice] = useState(() => (oldEntry ? oldEntry.base ?? oldEntry.amount ?? null : null));
  const [discount, setDiscount] = useState(() => oldEntry?.discount || null);
  const pay = applyDiscount(price, discount);
  const firstRoom = state.locations[0]?.rooms[0]?.id || '';
  const t = todayKey();
  const [f, setF] = useState({
    roomId: firstRoom, platform: 'Trực tiếp', guest: '', start: t, end: addDays(t, 1), checkIn: '14:00', checkOut: '12:00', note: '',
    ...data,
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const needPrice = !!finance;
  const priceOk = !needPrice || (price != null && price > 0);
  const valid = f.roomId && f.start && f.end && f.end > f.start && priceOk;
  const save = () => {
    if (!valid) return;
    const { summary, description, blocked, source, color, calendarId, ...clean } = f; // eslint-disable-line no-unused-vars
    const id = f.id || uid();
    dispatch({ type: 'SAVE_MANUAL', booking: { ...clean, id } });
    if (finance) {
      const old = finance.fin.prices?.[id];
      const { base, discount: _d, ...rest } = old || {}; // eslint-disable-line no-unused-vars
      const disc = discount?.value ? discount : null;
      finance.dispatch({ type: 'PRICE', id, entry: { ...rest, roomId: f.roomId, platform: f.platform, guest: f.guest, start: f.start, end: f.end, amount: pay, ...(disc ? { base: price, discount: disc } : {}), source: 'manual', at: Date.now(), by: user?.name || '' } });
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
      {needPrice && (
        <>
        <Field label={<>Giá phòng (trước giảm giá) <em className="req">*</em></>} hint={!priceOk ? null : `${diffDays(f.start, f.end) > 0 ? `${diffDays(f.start, f.end)} đêm · ` : ''}${f.platform !== 'Trực tiếp' ? `phí sàn ${feePct(finance.fin, f.platform)}%` : 'không mất phí sàn'}`}>
          <MoneyInput value={price} onChange={setPrice} placeholder="VD: 1.200.000" invalid={!priceOk} />
          {!priceOk && <span className="field-error">Bắt buộc nhập giá phòng để tạo đặt phòng</span>}
        </Field>
        <Field label="Giảm giá (không bắt buộc)"><DiscountInput value={discount} onChange={setDiscount} /></Field>
        {priceOk && <div className="pay-sum"><small>Khách trả{price !== pay ? ` · đã giảm ${fmtVND(price - pay)}` : ''}</small><b>{fmtVND(pay)}</b></div>}
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
