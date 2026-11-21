export function LogoMark({ size = 40, radius = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label="Hosty" className="logo-mark">
      <rect width="120" height="120" rx={radius} fill="#2D5BFF" />
      <path d="M30 58 L60 34 L90 58" fill="none" stroke="#FFFFFF" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M40 50 V88 M80 50 V88 M40 70 H80" fill="none" stroke="#FFFFFF" strokeWidth="12" strokeLinecap="round" />
      <circle cx="60" cy="52" r="6" fill="#FFC94D" />
    </svg>
  );
}

export function Logo({ size = 40 }) {
  return (
    <span className="logo">
      <LogoMark size={size} />
      <span className="logo-word" style={{ fontSize: size * 0.85 }} aria-hidden="true">Hosty</span>
    </span>
  );
}
