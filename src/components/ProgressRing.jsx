import { useEffect, useRef, useState } from 'react';
import { useCountUp, reducedMotion } from '../lib/motion.js';

/** Chạy `fn` khi không còn sheet nào che màn hình (để người dùng thấy được animation) */
function whenUncovered(fn) {
  let t; let raf;
  const go = () => {
    if (document.querySelector('.sheet-backdrop')) { t = setTimeout(go, 120); return; }
    raf = requestAnimationFrame(() => requestAnimationFrame(fn));
  };
  go();
  return () => { clearTimeout(t); cancelAnimationFrame(raf); };
}

/**
 * Vòng tiến độ: vẽ dần từ 0 lên `pct` khi xuất hiện, chạy mượt khi `pct` đổi.
 * `done`: vòng đầy + dấu ✓ vẽ dần + vòng sáng lan ra + chấm bắn ra (mỗi lần chuyển sang hoàn thành).
 * Animation chỉ bắt đầu khi không còn sheet nào che. `onShown(done)` báo khi trạng thái đã hiện ra.
 */
export function ProgressRing({ pct, done, size = 56, stroke = 6, onShown }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const target = done ? 100 : Math.max(0, Math.min(100, pct));
  const [shown, setShown] = useState(() => (reducedMotion() ? target : 0));
  const [doneShown, setDoneShown] = useState(false);
  const [burst, setBurst] = useState(0); // đổi key để chạy lại animation hoàn thành
  const num = useCountUp(Math.round(doneShown ? 100 : shown), 1100);
  const prevDone = useRef(null);

  useEffect(() => whenUncovered(() => {
    setShown(target);
    if (done !== prevDone.current) {
      if (done) setBurst((n) => n + 1);
      setDoneShown(done);
      onShown?.(done);
      prevDone.current = done;
    }
  }), [target, done]); // eslint-disable-line react-hooks/exhaustive-deps

  const half = size / 2;
  const dots = Array.from({ length: 8 }, (_, i) => i * 45);
  return (
    <span className={`pring ${doneShown ? 'done' : ''}`} style={{ width: size, height: size }} aria-hidden="true">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle className="pring-bg" cx={half} cy={half} r={r} strokeWidth={stroke} fill="none" />
        <circle
          className="pring-fg" cx={half} cy={half} r={r} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - shown / 100)} transform={`rotate(-90 ${half} ${half})`}
        />
        {doneShown && (
          <path className="pring-check" d={`M${half - 9} ${half + 0.5} L${half - 2.5} ${half + 7} L${half + 10} ${half - 6}`}
            fill="none" strokeWidth={stroke - 1.5} strokeLinecap="round" strokeLinejoin="round" pathLength="1" />
        )}
      </svg>
      {!doneShown && <span className="pring-num">{num}<small>%</small></span>}
      {doneShown && burst > 0 && (
        <span key={`b${burst}`} className="pring-burst">
          <span className="pring-wave" />
          {dots.map((a) => <span key={a} className="pring-dot" style={{ '--a': `${a}deg` }} />)}
        </span>
      )}
    </span>
  );
}
