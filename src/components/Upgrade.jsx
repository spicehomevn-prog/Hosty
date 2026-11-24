import { useEffect, useState } from 'react';
import { Lock, CheckCircle2, Revenue, Bell, Pricing, Building2, Users } from '../lib/icons.jsx';
import { PRO_FEATURES, TRIAL } from '../lib/plan.js';
import { UPGRADE_ZALO } from '../../site.config.js';
import { useSession } from '../lib/session.jsx';
import { Sheet } from './ui.jsx';

const ZALO = (import.meta.env?.VITE_UPGRADE_ZALO || UPGRADE_ZALO || '').replace(/\D/g, '');

/** Mở hộp "Nâng cấp tài khoản Pro" từ bất cứ đâu */
export const openUpgrade = (feature) => window.dispatchEvent(new CustomEvent('app-upgrade', { detail: feature || null }));

const LIST = [
  { k: 'finance', icon: Revenue, t: PRO_FEATURES.finance, d: 'Doanh thu, chi phí, lợi nhuận, còn phải thu, nhập file báo cáo sàn' },
  { k: 'push', icon: Bell, t: PRO_FEATURES.push, d: 'Tổng quan 8:00, báo trả / nhận phòng, nhắc task trên điện thoại' },
  { k: 'rates', icon: Pricing, t: PRO_FEATURES.rates, d: 'Bảng giá theo ngày, giảm giá, giá Airbnb tự cập nhật' },
  { k: 'rooms', icon: Building2, t: 'Không giới hạn phòng & địa điểm', d: `Gói dùng thử tối đa ${TRIAL.maxRooms} phòng, ${TRIAL.maxLocations} địa điểm` },
  { k: 'members', icon: Users, t: 'Không giới hạn nhân viên', d: `Gói dùng thử tối đa ${TRIAL.maxMembers} tài khoản dọn phòng` },
];

/** Gắn 1 lần trong App: nghe sự kiện openUpgrade và hiện hộp nâng cấp */
export function UpgradeHost() {
  const [feature, setFeature] = useState(undefined);
  const { workspace, plan } = useSession();
  useEffect(() => {
    const on = (e) => setFeature(e.detail);
    window.addEventListener('app-upgrade', on);
    return () => window.removeEventListener('app-upgrade', on);
  }, []);
  if (feature === undefined) return null;
  const key = feature === 'locations' ? 'rooms' : feature;
  const msg = `Xin chào, tôi muốn nâng cấp Hostexa Pro cho cơ sở "${workspace?.name || ''}".`;
  return (
    <Sheet open onClose={() => setFeature(undefined)} title="Nâng cấp tài khoản Pro"
      footer={ZALO
        ? <a className="btn primary block" href={`https://zalo.me/${ZALO}`} target="_blank" rel="noopener" onClick={() => navigator.clipboard?.writeText(msg).catch(() => {})}>Liên hệ qua Zalo</a>
        : <button className="btn primary block" onClick={() => setFeature(undefined)}>Đã hiểu</button>}>
      <div className="pro-head">
        <span className="pro-lock"><Lock size={26} /></span>
        <b>{PRO_FEATURES[feature] ? `${PRO_FEATURES[feature]} là tính năng Pro` : 'Mở khoá toàn bộ Hostexa'}</b>
        <p>Nâng cấp tài khoản Pro để kích hoạt tính năng.{plan?.trial ? (plan.expired ? ' Gói dùng thử đã hết hạn – dữ liệu đang ở chế độ chỉ xem.' : ` Gói dùng thử còn ${plan.daysLeft} ngày.`) : ''}</p>
      </div>
      <div className="pro-list">
        {LIST.map(({ k, icon: Icon, t, d }) => (
          <div key={k} className={`pro-item ${k === key ? 'on' : ''}`}>
            <span className="pro-ico"><Icon size={18} /></span>
            <span><b>{t}</b><small>{d}</small></span>
            <CheckCircle2 size={18} className="pro-ok" />
          </div>
        ))}
      </div>
      {ZALO && <p className="tiny muted">Bấm "Liên hệ qua Zalo": lời nhắn đã được copy sẵn, chỉ cần dán và gửi.</p>}
    </Sheet>
  );
}

/** Biểu tượng khoá nhỏ (góc ô / cạnh nút) */
export const LockBadge = ({ className = '' }) => <span className={`lock-badge ${className}`} aria-label="Tính năng Pro"><Lock size={12} /></span>;

/** Dòng bị khoá: bấm vào mở hộp nâng cấp */
export function LockedRow({ feature, title, sub }) {
  return (
    <button type="button" className="locked-row" onClick={() => openUpgrade(feature)}>
      <span className="pro-lock sm"><Lock size={16} /></span>
      <span><b>{title}</b>{sub && <small>{sub}</small>}</span>
      <span className="pro-pill">Pro</span>
    </button>
  );
}
