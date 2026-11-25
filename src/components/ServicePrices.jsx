import { useState } from 'react';
import { Plus, Trash2, ChevronLeft } from '../lib/icons.jsx';
import { useFinance } from '../lib/finance.jsx';
import { uid } from '../lib/store.jsx';
import { EXTRA_SUGGEST } from '../lib/fin.js';
import { MoneyInput, Sheet, toast } from './ui.jsx';

/**
 * Bảng giá dịch vụ cộng thêm (Bảng giá → Giá dịch vụ cộng thêm).
 * Chỉ dùng cho đặt phòng trực tiếp: khi thêm dịch vụ vào đặt phòng, đơn giá tự điền theo bảng này (sửa được từng lần).
 */
export function ServicePrices({ onClose, onBack }) {
  const { fin, dispatch } = useFinance();
  const [rows, setRows] = useState(() => (fin.services || []).map((x) => ({ ...x })));
  const set = (id, patch) => setRows(rows.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const add = (name = '') => setRows([...rows, { id: uid(), name, price: null }]);
  const used = new Set(rows.map((x) => x.name.trim().toLowerCase()));
  const clean = rows.filter((x) => x.name.trim()).map((x) => ({ id: x.id, name: x.name.trim(), price: x.price > 0 ? x.price : null }));
  const dup = clean.length !== new Set(clean.map((x) => x.name.toLowerCase())).size;
  const save = () => {
    dispatch({ type: 'SET_SERVICES', services: clean });
    toast(clean.length ? `Đã lưu ${clean.length} dịch vụ` : 'Đã xoá bảng giá dịch vụ');
    onBack();
  };
  return (
    <Sheet open onClose={onClose} title="Giá dịch vụ cộng thêm"
      footer={<button className="btn primary block" onClick={save} disabled={dup}>Lưu bảng giá dịch vụ</button>}>
      <button type="button" className="link svc-back" onClick={onBack}><ChevronLeft size={16} /> Bảng giá phòng</button>
      <p className="tiny muted svc-note">Chỉ áp dụng cho <b>đặt phòng trực tiếp</b>: khi thêm dịch vụ vào đặt phòng, đơn giá tự điền theo bảng này (vẫn sửa được từng lần). Giá các sàn không bị ảnh hưởng.</p>
      <div className="svc-list">
        {rows.length === 0 && <p className="tiny muted">Chưa có dịch vụ nào. Chọn gợi ý bên dưới hoặc thêm dịch vụ khác.</p>}
        {rows.map((x) => (
          <div key={x.id} className="svc-row">
            <input className="input sm" value={x.name} placeholder="Tên dịch vụ" onChange={(e) => set(x.id, { name: e.target.value })} aria-label="Tên dịch vụ" />
            <MoneyInput value={x.price} onChange={(v) => set(x.id, { price: v })} placeholder="Đơn giá" />
            <button type="button" className="icon-btn sm danger" aria-label={`Xoá ${x.name || 'dịch vụ'}`} onClick={() => setRows(rows.filter((y) => y.id !== x.id))}><Trash2 size={16} /></button>
          </div>
        ))}
      </div>
      {dup && <p className="field-error">Có 2 dịch vụ trùng tên</p>}
      <div className="chip-row svc-suggest">
        {EXTRA_SUGGEST.filter((s) => !used.has(s.name.toLowerCase())).map((s) => (
          <button key={s.name} type="button" className="mini-chip" onClick={() => add(s.name)}><Plus size={12} /> {s.name}</button>
        ))}
        <button type="button" className="mini-chip" onClick={() => add()}><Plus size={12} /> Dịch vụ khác</button>
      </div>
    </Sheet>
  );
}
