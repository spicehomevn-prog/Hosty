// Logo Hostexa — "Relay identity"
// Biểu tượng: một đường gấp khúc màu Midnight Plum, điểm bắt đầu Violet, điểm kết thúc Coral.
const PLUM = '#241A3B';
const MIST = '#F8F6FD';
const VIOLET = '#7C5CE6';
const CORAL = '#F0845A';

function SymbolPaths({ line, animated }) {
  return (
    <>
      <path className="lm-line" pathLength={animated ? 1 : undefined} d="M36 26 V60 H84 V94" fill="none" stroke={line} strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" />
      <path className="lm-start" d="M84 26 V35" fill="none" stroke={VIOLET} strokeWidth="18" strokeLinecap="round" />
      <path className="lm-end" d="M36 85 V94" fill="none" stroke={CORAL} strokeWidth="18" strokeLinecap="round" />
    </>
  );
}

/** Biểu tượng ứng dụng (ô vuông Midnight Plum) — dùng cho avatar, favicon, màn chờ */
export function LogoMark({ size = 40, animated = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label="Hostexa" className={`logo-mark ${animated ? 'animated' : ''}`}>
      <rect className="lm-bg" width="120" height="120" rx="27" fill={PLUM} />
      <g transform="translate(18 18) scale(0.7)">
        <SymbolPaths line={MIST} animated={animated} />
      </g>
    </svg>
  );
}

/** Biểu tượng trần (không nền) */
export function LogoSymbol({ size = 40, animated = false, dark = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label="Hostexa" className={`logo-symbol ${animated ? 'animated' : ''}`}>
      <SymbolPaths line={dark ? MIST : PLUM} animated={animated} />
    </svg>
  );
}

/** Logo chính: biểu tượng + chữ Hostexa (Manrope 700, −3%) */
export function Logo({ size = 40, animated = false, dark = false }) {
  return (
    <span className={`logo ${animated ? 'animated' : ''} ${dark ? 'dark' : ''}`}>
      <LogoSymbol size={size * 1.15} animated={animated} dark={dark} />
      <span className="logo-word" style={{ fontSize: size * 0.92 }} aria-hidden="true">Hostexa</span>
    </span>
  );
}
