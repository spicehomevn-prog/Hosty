// Bộ icon Hostexa
// Quy cách (theo "Hostexa — icon set"): lưới 24×24, nét 2px, đầu & góc tròn, chỉ nét không tô,
// mỗi icon một nét nhấn: violet = hành động / điểm bắt đầu, coral = cảnh báo / điểm kết thúc.
// Dưới 20px icon chuyển về một màu để giữ nét rõ.
// Nét chính dùng currentColor; màu nhấn lấy từ biến CSS --icon-accent / --icon-coral.

const RECT = (x, y, w, h, r) =>
  `M${x + r} ${y} H${x + w - r} a${r} ${r} 0 0 1 ${r} ${r} V${y + h - r} a${r} ${r} 0 0 1 -${r} ${r} H${x + r} a${r} ${r} 0 0 1 -${r} -${r} V${y + r} a${r} ${r} 0 0 1 ${r} -${r} Z`;
const CIRCLE = (cx, cy, r) => `M${cx} ${cy - r} a${r} ${r} 0 1 0 0 ${r * 2} a${r} ${r} 0 1 0 0 -${r * 2} Z`;
const CAL = 'M5 5 H19 a2 2 0 0 1 2 2 V19 a2 2 0 0 1 -2 2 H5 a2 2 0 0 1 -2 -2 V7 a2 2 0 0 1 2 -2 Z M3 10 H21 M8 3 V7 M16 3 V7';
const EYE = 'M2.5 12 C5 7 8.5 5 12 5 S19 7 21.5 12 C19 17 15.5 19 12 19 S5 17 2.5 12 Z';
const CLOUD = 'M7 18.5 H17 a4.5 4.5 0 0 0 0.9 -8.9 A6 6 0 0 0 6.4 10.5 A4 4 0 0 0 7 18.5 Z';
const LOCK_BODY = 'M7 11 H17 a2 2 0 0 1 2 2 V19 a2 2 0 0 1 -2 2 H7 a2 2 0 0 1 -2 -2 V13 a2 2 0 0 1 2 -2 Z';

/* ---- 24 icon trong bộ Hostexa ---- */
const SET = {
  overview: { b: `${RECT(3, 3, 7, 9, 1.5)} ${RECT(14, 3, 7, 5, 1.5)} ${RECT(14, 12, 7, 9, 1.5)}`, a: RECT(3, 16, 7, 5, 1.5) },
  calendar: { b: CAL, a: 'M8 15 H14' },
  bookings: { b: 'M9 4 H7 a2 2 0 0 0 -2 2 V19 a2 2 0 0 0 2 2 H17 a2 2 0 0 0 2 -2 V6 a2 2 0 0 0 -2 -2 H15 M10 2.5 H14 a1 1 0 0 1 1 1 V5 a1 1 0 0 1 -1 1 H10 a1 1 0 0 1 -1 -1 V3.5 a1 1 0 0 1 1 -1 Z', a: 'M9 13.5 L11 15.5 L15 11.5' },
  inbox: { b: 'M6 4 H18 a2 2 0 0 1 2 2 V14 a2 2 0 0 1 -2 2 H10 L6 20 V16 a2 2 0 0 1 -2 -2 V6 a2 2 0 0 1 2 -2 Z', a: 'M8 9 H16 M8 12 H12' },
  guests: { b: `${CIRCLE(9, 8, 3.5)} M3 20 a6 6 0 0 1 12 0`, a: 'M15.5 4.6 a3.5 3.5 0 0 1 0 6.8 M17 14.3 a6 6 0 0 1 4 5.7' },
  properties: { b: 'M12 3 L21 8 L12 13 L3 8 Z M3 16 L12 21 L21 16', a: 'M3 12 L12 17 L21 12' },
  checkin: { b: 'M14 4 H18 a2 2 0 0 1 2 2 V18 a2 2 0 0 1 -2 2 H14', a: 'M3 12 H14 M10 8 L14 12 L10 16' },
  checkout: { b: 'M10 4 H6 a2 2 0 0 0 -2 2 V18 a2 2 0 0 0 2 2 H10', a: 'M10 12 H21 M17 8 L21 12 L17 16', coral: true },
  housekeeping: { b: 'M15 3 L12 13 M6.5 13 H17.5 L19 21 H5 Z', a: 'M5 3 V7 M3 5 H7' },
  tasks: { b: `M11 6 H20 M11 12 H20 M11 18 H20 ${CIRCLE(5.5, 18, 1.5)}`, a: 'M4 6 L5.5 7.5 L8 5 M4 12 L5.5 13.5 L8 11' },
  access: { b: `${LOCK_BODY} M8 11 V7 a4 4 0 0 1 8 0 V11`, a: 'M12 15 V17' },
  notifications: { b: 'M6 16 V11 a6 6 0 0 1 12 0 V16 L19.5 18 H4.5 Z', a: 'M10 21 H14', coral: true },
  revenue: { b: 'M3 17 L9 11 L13 15 L21 7', a: 'M15 7 H21 V13' },
  reports: { b: 'M3 21 H21 M5.5 17 V13 M10 17 V9 M14.5 17 V12', a: 'M19 17 V5' },
  payments: { b: `${RECT(3, 5, 18, 14, 2)} M3 10 H21`, a: 'M7 15 H11' },
  pricing: { b: 'M3 12 V4 a1 1 0 0 1 1 -1 H12 L21 12 L12 21 Z', a: CIRCLE(7.5, 7.5, 1.5) },
  sync: { b: 'M4 12 a8 8 0 0 1 14 -5.3 L20 9 M20 4 V9 H15', a: 'M20 12 a8 8 0 0 1 -14 5.3 L4 15 M4 20 V15 H9' },
  automations: { b: `${CIRCLE(6, 6, 2.5)} ${CIRCLE(18, 18, 2.5)}`, a: 'M6 8.5 V12 H18 V15.5' },
  integrations: { b: 'M10 14 a4 4 0 0 1 0 -5.7 L12.6 5.7 a4 4 0 0 1 5.7 5.7 L17 12.7', a: 'M14 10 a4 4 0 0 1 0 5.7 L11.4 18.3 a4 4 0 0 1 -5.7 -5.7 L7 11.3' },
  search: { b: CIRCLE(11, 11, 7), a: 'M16 16 L21 21' },
  filter: { b: 'M4 6 H20 M7 12 H17', a: 'M10 18 H14' },
  add: { b: RECT(3, 3, 18, 18, 2), a: 'M12 8 V16 M8 12 H16' },
  export: { b: 'M4 15 V18 a2 2 0 0 0 2 2 H18 a2 2 0 0 0 2 -2 V15', a: 'M12 4 V15 M7 10 L12 15 L17 10' },
  settings: { b: 'M4 6 H7 M11 6 H20 M4 12 H13 M17 12 H20 M4 18 H5 M9 18 H20', a: `M7 6 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0 Z M13 12 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0 Z M5 18 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0 Z` },
};

/* ---- icon giao diện bổ sung, vẽ theo cùng quy cách ---- */
const EXTRA = {
  plus: { b: 'M12 5 V19 M5 12 H19' },
  close: { b: 'M6 6 L18 18 M18 6 L6 18' },
  minus: { b: 'M5 12 H19' },
  check: { b: 'M5 12.5 L10 17.5 L19 7' },
  chevronLeft: { b: 'M15 5 L8 12 L15 19' },
  chevronRight: { b: 'M9 5 L16 12 L9 19' },
  arrowLeft: { b: 'M19 12 H5', a: 'M11 6 L5 12 L11 18' },
  arrowRight: { b: 'M5 12 H19', a: 'M13 6 L19 12 L13 18' },
  swap: { b: 'M4 8 H20 M16 4 L20 8 L16 12', a: 'M20 16 H4 M8 12 L4 16 L8 20' },
  checkCircle: { b: CIRCLE(12, 12, 9), a: 'M8 12.5 L11 15.5 L16 9.5' },
  alertCircle: { b: CIRCLE(12, 12, 9), a: 'M12 7.5 V12.5 M12 16.2 V16.3', coral: true },
  alertTriangle: { b: 'M10.3 4.2 L2.9 17 a2 2 0 0 0 1.7 3 H19.4 a2 2 0 0 0 1.7 -3 L13.7 4.2 a2 2 0 0 0 -3.4 0 Z', a: 'M12 9.5 V13 M12 16.4 V16.5', coral: true },
  copy: { b: RECT(8, 8, 12, 12, 2), a: 'M16 4 H6 a2 2 0 0 0 -2 2 V16' },
  trash: { b: 'M4 7 H20 M6.5 7 L7.4 19.2 a2 2 0 0 0 2 1.8 H14.6 a2 2 0 0 0 2 -1.8 L17.5 7 M9 7 V4.5 a1 1 0 0 1 1 -1 H14 a1 1 0 0 1 1 1 V7', a: 'M10.5 11 V17 M13.5 11 V17', coral: true },
  edit: { b: 'M16.4 3.6 a2.1 2.1 0 0 1 3 3 L8 18 L4 19 L5 15 Z', a: 'M14 6 L18 10' },
  eye: { b: EYE, a: CIRCLE(12, 12, 2.5) },
  eyeOff: { b: EYE, a: 'M4 4 L20 20', coral: true },
  loader: { b: 'M21 12 a9 9 0 1 1 -9 -9', a: 'M12 3 a9 9 0 0 1 9 9' },
  pin: { b: 'M12 21 C12 21 5 14.5 5 9.5 a7 7 0 0 1 14 0 C19 14.5 12 21 12 21 Z', a: CIRCLE(12, 9.5, 2) },
  clock: { b: CIRCLE(12, 12, 9), a: 'M12 7.5 V12 L15 14' },
  moon: { b: 'M20 14.5 A8 8 0 1 1 9.5 4 A6.5 6.5 0 0 0 20 14.5 Z', a: 'M17.5 3 V6 M16 4.5 H19' },
  ban: { b: CIRCLE(12, 12, 9), a: 'M5.6 5.6 L18.4 18.4', coral: true },
  door: { b: 'M6 21 V4.5 a1.5 1.5 0 0 1 1.5 -1.5 H16.5 a1.5 1.5 0 0 1 1.5 1.5 V21 M3 21 H21', a: 'M14.5 12 V12.1' },
  user: { b: CIRCLE(12, 8, 4), a: 'M4.5 20.5 a7.5 7.5 0 0 1 15 0' },
  unlock: { b: `${LOCK_BODY} M8 11 V7 a4 4 0 0 1 7.7 -1.5`, a: 'M12 15 V17' },
  key: { b: `${CIRCLE(7.5, 15.5, 4.5)} M10.7 12.3 L20 3`, a: 'M15.5 7.5 L18 10 M18 5 L20.5 7.5' },
  shield: { b: 'M12 3 L19.5 6 V11.5 C19.5 16 16.3 19.6 12 21 C7.7 19.6 4.5 16 4.5 11.5 V6 Z', a: 'M9 12 L11 14 L15 10' },
  cloud: { b: CLOUD, a: 'M10 14.5 H14' },
  cloudOff: { b: CLOUD, a: 'M3 3 L21 21', coral: true },
  history: { b: 'M4 12 a8 8 0 1 0 2.3 -5.7 L4 8.5 M4 4 V8.5 H8.5', a: 'M12 8 V12 L14.5 14.5' },
  type: { b: 'M5 7 V5 H19 V7 M12 5 V19', a: 'M9 19 H15' },
  import: { b: 'M4 15 V18 a2 2 0 0 0 2 2 H18 a2 2 0 0 0 2 -2 V15', a: 'M12 15 V4 M7 9 L12 4 L17 9' },
  calendarPlus: { b: CAL, a: 'M12 13 V18 M9.5 15.5 H14.5' },
  calendarRange: { b: CAL, a: 'M7 14.5 H17' },
};

export const GLYPHS = { ...SET, ...EXTRA };

export function Icon({ name, size = 20, strokeWidth = 2, className = '', style, title, ...rest }) {
  const g = GLYPHS[name];
  if (!g) return null;
  const mono = size < 20; // dưới 20px: một màu
  const accent = mono ? 'currentColor' : g.coral ? 'var(--icon-coral, #F0845A)' : 'var(--icon-accent, #7C5CE6)';
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" className={`hx-icon ${className}`} style={style}
      aria-hidden={title ? undefined : 'true'} role={title ? 'img' : undefined} aria-label={title} {...rest}
    >
      <path d={g.b} />
      {g.a && <path d={g.a} stroke={accent} />}
    </svg>
  );
}

const make = (name) => {
  const C = (props) => <Icon name={name} {...props} />;
  C.displayName = `Icon(${name})`;
  return C;
};

/* Tên cũ (trước đây dùng lucide-react) -> icon Hostexa tương ứng */
export const LayoutGrid = make('overview');
export const CalendarDays = make('calendar');
export const CalendarPlus = make('calendarPlus');
export const CalendarRange = make('calendarRange');
export const BedDouble = make('bookings');
export const NotebookPen = make('inbox');
export const Users = make('guests');
export const UserRound = make('user');
export const User = make('user');
export const Building2 = make('properties');
export const LogIn = make('checkin');
export const LogOut = make('checkout');
export const Sparkles = make('housekeeping');
export const ListChecks = make('tasks');
export const ClipboardPlus = make('tasks');
export const Lock = make('access');
export const Unlock = make('unlock');
export const KeyRound = make('key');
export const RefreshCw = make('sync');
export const Link2 = make('integrations');
export const Download = make('export');
export const Upload = make('import');
export const Settings2 = make('settings');
export const Plus = make('plus');
export const X = make('close');
export const Minus = make('minus');
export const Check = make('check');
export const CheckCircle2 = make('checkCircle');
export const AlertCircle = make('alertCircle');
export const AlertTriangle = make('alertTriangle');
export const ChevronLeft = make('chevronLeft');
export const ChevronRight = make('chevronRight');
export const ArrowLeft = make('arrowLeft');
export const ArrowRight = make('arrowRight');
export const ArrowLeftRight = make('swap');
export const Copy = make('copy');
export const Trash2 = make('trash');
export const Pencil = make('edit');
export const Eye = make('eye');
export const EyeOff = make('eyeOff');
export const Loader2 = make('loader');
export const MapPin = make('pin');
export const Clock = make('clock');
export const Moon = make('moon');
export const Ban = make('ban');
export const DoorOpen = make('door');
export const ShieldCheck = make('shield');
export const Cloud = make('cloud');
export const CloudOff = make('cloudOff');
export const History = make('history');
export const Type = make('type');
