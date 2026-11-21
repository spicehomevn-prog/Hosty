import { useEffect, useState } from 'react';
import { X, Minus, Plus } from 'lucide-react';

export function Sheet({ open, onClose, title, children, footer }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-grab" />
        <div className="sheet-head">
          <h3>{title}</h3>
          <button className="icon-btn sm" onClick={onClose} aria-label="Đóng"><X size={18} /></button>
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

export function Field({ label, children, hint }) {
  return (
    <label className="field">
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
  return <div className="progress"><div style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}

export function Avatar({ name }) {
  const initials = (name || 'L').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return <div className="avatar">{initials}</div>;
}
