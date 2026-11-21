import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Hiệu ứng gợn sóng (ripple) cho mọi nút bấm */
export function initPressEffects() {
  if (typeof document === 'undefined') return;
  document.addEventListener('pointerdown', (e) => {
    if (reducedMotion()) return;
    const btn = e.target.closest?.('button');
    if (!btn || btn.disabled || 'noRipple' in btn.dataset) return;
    if (getComputedStyle(btn).position === 'static') btn.style.position = 'relative';
    const r = btn.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 2.2;
    const host = document.createElement('span');
    host.className = 'ripple-host';
    const dot = document.createElement('span');
    dot.className = 'ripple';
    dot.style.width = dot.style.height = `${size}px`;
    dot.style.left = `${e.clientX - r.left - size / 2}px`;
    dot.style.top = `${e.clientY - r.top - size / 2}px`;
    host.appendChild(dot);
    btn.appendChild(host);
    setTimeout(() => host.remove(), 650);
  }, { passive: true });
}

/** Số đếm từ giá trị cũ (lần đầu: 0) lên giá trị mới */
export function useCountUp(target, duration = 700) {
  const [val, setVal] = useState(() => (reducedMotion() ? target : 0));
  const from = useRef(val);
  useEffect(() => {
    if (reducedMotion()) { setVal(target); return undefined; }
    const start = performance.now();
    const a = from.current;
    let raf;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = Math.round(a + (target - a) * eased);
      setVal(v);
      from.current = v;
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

/**
 * Thanh điều hướng: khối màu (blob) chảy theo tab đang chọn + các tab trượt mượt (FLIP).
 * Mỗi item trong nav cần thuộc tính data-flip="<id>".
 */
export function useFlipNav(navRef, active, enabled = true) {
  const prevPos = useRef(null);
  const [blob, setBlob] = useState(null);

  const measure = (animate) => {
    const nav = navRef.current;
    if (!nav) return;
    const act = nav.querySelector(`[data-flip="${active}"]`);
    if (!act) return;
    const left = act.offsetLeft;
    const right = nav.clientWidth - left - act.offsetWidth;
    setBlob((b) => ({
      left,
      right,
      dir: b ? Math.sign(left - b.left) : 0,
      animate: animate && !!b && !reducedMotion(),
    }));
  };

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!enabled || !nav) { prevPos.current = null; setBlob(null); return; }
    const items = [...nav.querySelectorAll('[data-flip]')];
    items.forEach((el) => { el.style.transition = 'none'; el.style.transform = ''; });
    const pos = new Map(items.map((el) => [el.dataset.flip, el.getBoundingClientRect().left]));
    if (prevPos.current && !reducedMotion()) {
      let moved = false;
      items.forEach((el) => {
        const old = prevPos.current.get(el.dataset.flip);
        const dx = old == null ? 0 : old - pos.get(el.dataset.flip);
        if (Math.abs(dx) > 0.5) { el.style.transform = `translateX(${dx}px)`; moved = true; }
      });
      if (moved) {
        void nav.offsetWidth; // reflow
        items.forEach((el) => {
          el.style.transition = 'transform .46s cubic-bezier(.3,1.2,.4,1)';
          el.style.transform = '';
        });
      }
    }
    const first = !prevPos.current;
    prevPos.current = pos;
    if (first) setBlob(null);
    measure(!first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, enabled]);

  useEffect(() => {
    const onResize = () => measure(false);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return blob;
}
