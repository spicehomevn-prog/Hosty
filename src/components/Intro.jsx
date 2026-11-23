import { useEffect, useState } from 'react';
import { LogoMark } from './Logo.jsx';
import { reducedMotion } from '../lib/motion.js';

const WORD = 'Hostexa';
// hạt lấp lánh: vị trí ngang (%), độ trễ (s), kích thước (px)
const SPARKS = [[12, 0.2, 6], [24, 0.9, 4], [38, 0.5, 5], [55, 1.2, 4], [66, 0.1, 6], [78, 0.7, 5], [88, 1.0, 4], [30, 1.5, 3], [70, 1.6, 3], [48, 0.3, 4]];

function greeting(name) {
  const h = new Date().getHours();
  const part = h < 11 ? 'Chào buổi sáng' : h < 13 ? 'Chào buổi trưa' : h < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
  return name ? `${part}, ${name} 👋` : 'Lịch đặt phòng & dọn phòng';
}

/** Màn chào mừng mỗi lần mở app: logo vẽ dần, chữ hiện từng ký tự, nền gradient có đốm màu trôi. Chạm để bỏ qua. */
export function Intro({ name, onDone }) {
  const [out, setOut] = useState(false);
  useEffect(() => {
    document.getElementById('intro')?.remove(); // khung tĩnh trong index.html (hiện trước khi JS chạy)
    const rm = reducedMotion();
    const t1 = setTimeout(() => setOut(true), rm ? 600 : 2000);
    const t2 = setTimeout(onDone, rm ? 750 : 2450);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const skip = () => { if (out) return; setOut(true); setTimeout(onDone, 380); };

  return (
    <div className={`intro ${out ? 'out' : ''}`} onClick={skip} aria-hidden="true">
      <span className="intro-orb o1" /><span className="intro-orb o2" /><span className="intro-orb o3" />
      {SPARKS.map(([x, d, s], i) => <span key={i} className="intro-spark" style={{ '--x': `${x}%`, '--d': `${d}s`, '--s': `${s}px` }} />)}
      <div className="intro-center">
        <span className="intro-mark">
          <span className="intro-wave" />
          <span className="intro-wave w2" />
          <LogoMark size={96} animated />
        </span>
        <h1 className="intro-word">{WORD.split('').map((c, i) => <span key={i} style={{ '--i': i }}>{c}</span>)}</h1>
        <p className="intro-sub">{greeting(name)}</p>
      </div>
    </div>
  );
}

/** Vòng tròn loading: cung gradient vừa xoay vừa co giãn */
export function LoadingRing({ size = 44 }) {
  return (
    <span className="lring" role="status" aria-label="Đang tải">
      <svg width={size} height={size} viewBox="0 0 50 50">
        <defs>
          <linearGradient id="lring-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#7C5CE6" />
            <stop offset="55%" stopColor="#FF7FB0" />
            <stop offset="100%" stopColor="#FFB45C" />
          </linearGradient>
        </defs>
        <circle className="lring-bg" cx="25" cy="25" r="20" fill="none" strokeWidth="5" />
        <circle className="lring-arc" cx="25" cy="25" r="20" fill="none" strokeWidth="5" strokeLinecap="round" stroke="url(#lring-g)" />
      </svg>
    </span>
  );
}
