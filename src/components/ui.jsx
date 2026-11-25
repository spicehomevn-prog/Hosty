import { useCallback, useEffect, useState } from 'react';
import { X, Minus, Plus } from '../lib/icons.jsx';
import { parseVND, groupDigits } from '../lib/money.js';

export function Sheet({ open, onClose, title, children, footer }) {
  const [closing, setClosing] = useState(false);
  const close = useCallback(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return onClose();
    setClosing(true);
    setTimeout(() => { setClosing(false); onClose(); }, 200);
  }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, close]);
  if (!open) return null;
  return (
    <div className={`sheet-backdrop ${closing ? 'closing' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-grab" />
        <div className="sheet-head">
          <h3>{title}</h3>
          <button className="icon-btn sm" onClick={close} aria-label="Đóng"><X size={18} /></button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Stepper({ value, onChange, min = 1, max = 50 }) {
  return (
    <div className="stepper">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="Giảm"><Minus size={18} /></button>
      <input type="number" value={value} min={min} max={max}
        onChange={(e) => { const n = parseInt(e.target.value, 10); if (!Number.isNaN(n)) onChange(Math.min(max, Math.max(min, n))); }} />
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="Tăng"><Plus size={18} /></button>
    </div>
  );
}

// <label> bọc cả khối có nút (chip, xoá dòng…): bấm nút xong thì nút bị gỡ khỏi trang, Safari lại coi như bấm vào
// label và "bấm hộ" nút đầu tiên trong khung (vd. chip "+ dịch vụ" -> dòng vừa xoá hiện lại). Chặn việc bấm hộ đó.
const stopLabelRelay = (e) => { if (e.target instanceof Element && e.target.closest('button[type="button"]')) e.preventDefault(); };

export function Field({ label, children, hint }) {
  return (
    <label className="field" onClick={stopLabelRelay}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export const toast = (msg) => window.dispatchEvent(new CustomEvent('app-toast', { detail: msg }));

export function Toaster() {
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    let t;
    const on = (e) => { setMsg(e.detail); clearTimeout(t); t = setTimeout(() => setMsg(null), 2200); };
    window.addEventListener('app-toast', on);
    return () => window.removeEventListener('app-toast', on);
  }, []);
  return msg ? <div className="toast" role="status">{msg}</div> : null;
}

export function Progress({ value }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(value));
    return () => cancelAnimationFrame(id);
  }, [value]);
  return <div className="progress"><div style={{ width: `${Math.max(0, Math.min(100, shown))}%` }} /></div>;
}

export function Avatar({ name }) {
  const initials = (name || 'L').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return <div className="avatar">{initials}</div>;
}

/** Ô nhập tiền VND: gõ số, tự thêm dấu chấm; value là số (hoặc null) */
export function MoneyInput({ value, onChange, placeholder = '0', invalid, autoFocus, id }) {
  const [text, setText] = useState(value == null ? '' : groupDigits(value));
  useEffect(() => {
    if (parseVND(text) !== (value ?? null)) setText(value == null ? '' : groupDigits(value));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={`money-input ${invalid ? 'invalid' : ''}`}>
      <input
        id={id} className="input" inputMode="numeric" autoComplete="off" placeholder={placeholder} value={text} autoFocus={autoFocus}
        onChange={(e) => {
          const raw = e.target.value;
          const n = parseVND(raw);
          setText(/[a-zà-ỹ]/i.test(raw) ? raw : (n == null ? '' : groupDigits(n)));
          onChange(n);
        }}
        onBlur={() => setText(value == null ? '' : groupDigits(value))}
      />
      <span className="money-unit">₫</span>
    </div>
  );
}

/** Giảm giá cho một đặt phòng: % hoặc số tiền. value = { type: 'pct'|'amount', value } | null */
export function DiscountInput({ value, onChange }) {
  const type = value?.type || 'pct';
  const set = (patch) => onChange({ type, value: value?.value ?? null, ...patch });
  return (
    <div className="discount-input">
      <div className="seg">
        <button type="button" className={type === 'pct' ? 'on' : ''} onClick={() => set({ type: 'pct', value: null })}>%</button>
        <button type="button" className={type === 'amount' ? 'on' : ''} onClick={() => set({ type: 'amount', value: null })}>₫</button>
      </div>
      {type === 'pct' ? (
        <div className="money-input">
          <input className="input" type="number" inputMode="decimal" min="0" max="100" step="1" placeholder="0" value={value?.value ?? ''}
            onChange={(e) => set({ value: e.target.value === '' ? null : Math.min(100, Math.max(0, Number(e.target.value))) })} />
          <span className="money-unit">%</span>
        </div>
      ) : (
        <MoneyInput value={value?.value ?? null} onChange={(v) => set({ value: v })} placeholder="Số tiền giảm" />
      )}
    </div>
  );
}
