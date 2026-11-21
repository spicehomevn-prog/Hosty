export function LogoMark({ size = 40, radius = 30, animated = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label="Hosty" className={`logo-mark ${animated ? 'animated' : ''}`}>
      <rect className="lm-bg" width="120" height="120" rx={radius} fill="#2D5BFF" />
      <path className="lm-roof" pathLength="1" d="M30 58 L60 34 L90 58" fill="none" stroke="#FFFFFF" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
      <path className="lm-h lm-h1" pathLength="1" d="M40 50 V88" fill="none" stroke="#FFFFFF" strokeWidth="12" strokeLinecap="round" />
      <path className="lm-h lm-h2" pathLength="1" d="M80 50 V88" fill="none" stroke="#FFFFFF" strokeWidth="12" strokeLinecap="round" />
      <path className="lm-h lm-h3" pathLength="1" d="M40 70 H80" fill="none" stroke="#FFFFFF" strokeWidth="12" strokeLinecap="round" />
      <circle className="lm-dot" cx="60" cy="52" r="6" fill="#FFC94D" />
    </svg>
  );
}

export function Logo({ size = 40, animated = false }) {
  return (
    <span className={`logo ${animated ? 'animated' : ''}`}>
      <LogoMark size={size} animated={animated} />
      <span className="logo-word" style={{ fontSize: size * 0.85 }} aria-hidden="true">Hosty</span>
    </span>
  );
}
