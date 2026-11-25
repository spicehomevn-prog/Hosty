import { useState } from 'react';
import { Plus, Trash2 } from '../lib/icons.jsx';
import { uid } from '../lib/store.jsx';
import { EXTRA_SUGGEST } from '../lib/fin.js';
import { fmtVND } from '../lib/money.js';
import { Field, MoneyInput, Stepper } from './ui.jsx';

export const DEPOSIT_METHODS = ['Chuyển khoản', 'Tiền mặt', 'Ví điện tử'];

/**
 * Dịch vụ cộng thêm: danh sách { id, name, price, qty }.
 * services: bảng giá dịch vụ (Bảng giá → Giá dịch vụ cộng thêm, chỉ cho đặt phòng trực tiếp) -> chip điền sẵn đơn giá.
 */
export function ExtrasEditor({ value = [], onChange, services }) {
  const set = (id, patch) => onChange(value.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const [focusId, setFocusId] = useState(null);
  const add = (x) => { const id = uid(); setFocusId(id); onChange([...value, { id, name: '', price: null, qty: 1, ...x }]); };
  const used = new Set(value.map((x) => x.name));
  const list = services?.length ? services : EXTRA_SUGGEST;
  return (
    <div className="extras">
      {value.map((x) => (
        <div key={x.id} className="extra-row">
          <input className="input sm extra-name" value={x.name} placeholder="Tên dịch vụ" onChange={(e) => set(x.id, { name: e.target.value })} />
          <div className="extra-line">
            <MoneyInput value={x.price} onChange={(v) => set(x.id, { price: v })} placeholder="Đơn giá" invalid={!(x.price > 0)} autoFocus={x.id === focusId && !!x.name} />
            <span className="extra-x">×</span>
            <Stepper value={x.qty || 1} min={1} max={99} onChange={(q) => set(x.id, { qty: q })} />
            <button type="button" className="icon-btn sm danger" aria-label="Xoá dịch vụ" onClick={() => onChange(value.filter((y) => y.id !== x.id))}><Trash2 size={16} /></button>
          </div>
          {!(x.price > 0) && <small className="extra-hint">Nhập đơn giá hoặc xoá dòng (chưa có giá thì không được lưu)</small>}
          {x.price > 0 && (x.qty || 1) > 1 && <small className="extra-sum">= {fmtVND(x.price * (x.qty || 1))}</small>}
        </div>
      ))}
      <div className="chip-row extra-suggest">
        {list.filter((s) => !used.has(s.name)).map((s) => (
          <button key={s.name} type="button" className="mini-chip" onClick={() => add({ name: s.name, ...(s.price > 0 ? { price: s.price } : {}) })}>
            <Plus size={12} /> {s.name}{s.price > 0 && <em>{fmtVND(s.price)}</em>}
          </button>
        ))}
        <button type="button" className="mini-chip" onClick={() => add({})}><Plus size={12} /> Dịch vụ khác</button>
      </div>
    </div>
  );
}

/** Dịch vụ cộng thêm + đặt cọc + khung tổng phải thu cho đặt phòng trực tiếp */
export function PaymentFields({ room, extras, setExtras, deposit, setDeposit, method, setMethod, services }) {
  const ext = extras.reduce((a, x) => a + (Number(x.price) || 0) * (Number(x.qty) || 1), 0);
  const total = (room || 0) + ext;
  const due = Math.max(0, total - (deposit || 0));
  const over = (deposit || 0) > total && total > 0;
  return (
    <>
      <Field label="Dịch vụ cộng thêm"><ExtrasEditor value={extras} onChange={setExtras} services={services} /></Field>
      <Field label="Đặt cọc trước">
        <MoneyInput value={deposit} onChange={setDeposit} placeholder="Số tiền khách đã cọc" invalid={over} />
        {deposit > 0 && (
          <div className="chip-row">
            {DEPOSIT_METHODS.map((m) => (
              <button key={m} type="button" className={`mini-chip ${method === m ? 'on' : ''}`} style={{ '--pc': '#6B4FD8' }} onClick={() => setMethod(method === m ? '' : m)}>{m}</button>
            ))}
          </div>
        )}
        {over && <span className="field-error">Tiền cọc lớn hơn tổng tiền</span>}
      </Field>
      <div className="due-box">
        <div><span>Tiền phòng (sau giảm)</span><b>{fmtVND(room || 0)}</b></div>
        {ext > 0 && <div><span>Dịch vụ cộng thêm</span><b>{fmtVND(ext)}</b></div>}
        <div className="sum"><span>Tổng tiền</span><b>{fmtVND(total)}</b></div>
        {deposit > 0 && <div><span>Đã cọc{method ? ` (${method.toLowerCase()})` : ''}</span><b>−{fmtVND(deposit)}</b></div>}
        <div className="due"><span>Còn phải thu</span><b>{fmtVND(due)}</b></div>
      </div>
    </>
  );
}
