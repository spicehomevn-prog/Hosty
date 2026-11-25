import { useEffect, useState } from 'react';
import { Lock, Revenue, Bell, Pricing, CheckCircle2 } from '../lib/icons.jsx';
import { PRO_FEATURES, PLANS, PAID, COMBOS, comboPrice } from '../lib/plan.js';
import { UPGRADE_ZALO } from '../../site.config.js';
import { useSession } from '../lib/session.jsx';
import { fmtVND } from '../lib/money.js';
import { Sheet } from './ui.jsx';

const ZALO = (import.meta.env?.VITE_UPGRADE_ZALO || UPGRADE_ZALO || '').replace(/\D/g, '');

/** Mở hộp "Nâng cấp / gia hạn gói" từ bất cứ đâu */
export const openUpgrade = (feature) => window.dispatchEvent(new CustomEvent('app-upgrade', { detail: feature || null }));

/** Tính năng có ở mọi gói trả phí */
const COMMON = [
  { icon: Revenue, t: PRO_FEATURES.finance, d: 'Doanh thu, chi phí, lợi nhuận, còn phải thu, nhập file báo cáo sàn' },
  { icon: Bell, t: PRO_FEATURES.push, d: 'Tổng quan 8:00, báo trả / nhận phòng, nhắc task trên điện thoại' },
  { icon: Pricing, t: PRO_FEATURES.rates, d: 'Giá theo ngày, giá riêng từng sàn, form Excel, giảm giá' },
];
const lim = (n, unit) => (Number.isFinite(n) ? `${n} ${unit}` : `${unit} không giới hạn`);
/** gói gợi ý: đang dùng thử -> Cơ bản; cần thêm phòng / địa điểm / nhân viên -> gói kế tiếp; còn lại -> gia hạn gói đang dùng */
function suggest(planId, feature) {
  if (!PAID.includes(planId)) return 'basic';
  if (['rooms', 'locations', 'members'].includes(feature)) return PAID[Math.min(PAID.length - 1, PAID.indexOf(planId) + 1)];
  return planId;
}

/** Gắn 1 lần trong App: nghe sự kiện openUpgrade và hiện hộp chọn gói */
export function UpgradeHost() {
  const [feature, setFeature] = useState(undefined);
  const { workspace, plan } = useSession();
  const [pick, setPick] = useState('basic');
  const [months, setMonths] = useState(1);
  useEffect(() => {
    const on = (e) => { setFeature(e.detail); setPick(suggest(plan?.id, e.detail)); setMonths(1); };
    window.addEventListener('app-upgrade', on);
    return () => window.removeEventListener('app-upgrade', on);
  }, [plan?.id]);
  if (feature === undefined) return null;
  const renew = pick === plan?.id;
  const price = comboPrice(pick, months);
  const msg = `Xin chào, tôi muốn ${renew ? 'gia hạn' : 'đăng ký'} Hostexa gói ${PLANS[pick].name} ${months} tháng (${fmtVND(price)}) cho cơ sở "${workspace?.name || ''}".`;
  const head = PRO_FEATURES[feature]
    ? (feature === 'ota' ? `${PRO_FEATURES[feature]} chỉ có ở tài khoản VIP` : PLANS[plan?.id]?.features?.includes(feature) || ['rooms', 'locations', 'members'].includes(feature)
      ? `${PRO_FEATURES[feature]}: cần gói cao hơn` : `${PRO_FEATURES[feature]} có ở các gói trả phí`)
    : (plan?.trial ? 'Chọn gói Hostexa' : 'Gia hạn / đổi gói');
  const status = plan?.expired
    ? `Gói ${plan.name} đã hết hạn – dữ liệu đang ở chế độ chỉ xem.`
    : plan?.trial ? `Bạn đang dùng thử, còn ${plan.daysLeft} ngày.`
      : plan?.ends ? `Gói ${plan.name} dùng tới ${new Date(plan.ends).toLocaleDateString('vi-VN')}.` : '';
  return (
    <Sheet open onClose={() => setFeature(undefined)} title="Gói Hostexa"
      footer={ZALO
        ? <a className="btn primary block" href={`https://zalo.me/${ZALO}`} target="_blank" rel="noopener" onClick={() => navigator.clipboard?.writeText(msg).catch(() => {})}>
            Liên hệ Zalo · {PLANS[pick].name} {months} tháng {fmtVND(price)}
          </a>
        : <button className="btn primary block" onClick={() => setFeature(undefined)}>Đã hiểu</button>}>
      <div className="pro-head">
        <span className="pro-lock"><Lock size={26} /></span>
        <b>{head}</b>
        {status && <p>{status}</p>}
      </div>
      <div className="plan-cards" role="radiogroup" aria-label="Chọn gói">
        {PAID.map((id) => {
          const P = PLANS[id];
          return (
            <button key={id} type="button" role="radio" aria-checked={pick === id} className={`plan-card ${pick === id ? 'on' : ''}`} onClick={() => setPick(id)}>
              <span className="pc-main">
                <span className="pc-top"><b>{P.name}</b>{plan?.id === id && <em className="pc-cur">đang dùng</em>}</span>
                <small>{lim(P.maxRooms, 'phòng')} · {lim(P.maxLocations, 'địa điểm')} · {lim(P.maxMembers, 'nhân viên')}</small>
              </span>
              <span className="pc-price">{fmtVND(P.price)}<small>/tháng</small></span>
            </button>
          );
        })}
      </div>
      <div className="seg wide plan-months">
        {COMBOS.map((c) => (
          <button key={c.months} type="button" className={months === c.months ? 'on' : ''} onClick={() => setMonths(c.months)}>
            {c.months} tháng{c.off ? ` −${c.off}%` : ''}
          </button>
        ))}
      </div>
      <p className="plan-total">Tổng: <b>{fmtVND(price)}</b>{months > 1 && <small> (≈ {fmtVND(Math.round(price / months / 1000) * 1000)}/tháng)</small>}</p>
      <div className="pro-list">
        {COMMON.map(({ icon: Icon, t, d }) => (
          <div key={t} className="pro-item">
            <span className="pro-ico"><Icon size={18} /></span>
            <span><b>{t}</b><small>{d}</small></span>
            <CheckCircle2 size={18} className="pro-ok" />
          </div>
        ))}
      </div>
      <p className="tiny muted">Cần tư vấn chọn gói? Nhắn Zalo hỗ trợ. Giá chưa gồm VAT. {ZALO ? 'Bấm "Liên hệ Zalo": lời nhắn đã được copy sẵn, chỉ cần dán và gửi. Sau khi chuyển khoản, gói được kích hoạt trong ngày.' : ''}</p>
    </Sheet>
  );
}

/** Biểu tượng khoá nhỏ (góc ô / cạnh nút) */
export const LockBadge = ({ className = '' }) => <span className={`lock-badge ${className}`} aria-label="Cần gói trả phí"><Lock size={12} /></span>;

/** Dòng bị khoá: bấm vào mở hộp nâng cấp */
export function LockedRow({ feature, title, sub }) {
  return (
    <button type="button" className="locked-row" onClick={() => openUpgrade(feature)}>
      <span className="pro-lock sm"><Lock size={16} /></span>
      <span><b>{title}</b>{sub && <small>{sub}</small>}</span>
      <span className="pro-pill">Trả phí</span>
    </button>
  );
}
