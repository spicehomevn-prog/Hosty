import { MessageCircle, ChevronRight } from '../lib/icons.jsx';
import { SUPPORT_ZALO } from '../../site.config.js';
import { useSession } from '../lib/session.jsx';
import { toast } from './ui.jsx';

export const SUPPORT = (import.meta.env?.VITE_SUPPORT_ZALO || SUPPORT_ZALO || '').replace(/\D/g, '');
const pretty = (n) => n.replace(/^(\d{4})(\d{3})(\d+)$/, '$1 $2 $3');

/** Mở chat Zalo hỗ trợ; chép sẵn lời nhắn có tên cơ sở + tài khoản để dán vào Zalo (Zalo không điền sẵn được nội dung). */
export function openSupport(msg) {
  if (msg) navigator.clipboard?.writeText(msg).then(() => toast('Đã copy lời nhắn – dán vào Zalo rồi gửi')).catch(() => {});
  window.open(`https://zalo.me/${SUPPORT}`, '_blank', 'noopener');
}

/** Thẻ "Liên hệ hỗ trợ Zalo" ở màn Cơ sở */
export function SupportCard() {
  const s = useSession();
  if (!SUPPORT) return null;
  const msg = `Xin chào, tôi cần hỗ trợ Hostexa.\nCơ sở: ${s.workspace?.name || '—'}\nTài khoản: ${s.user?.username || '—'}\nVấn đề: `;
  return (
    <button type="button" className="support-card" onClick={() => openSupport(msg)}>
      <span className="support-ico"><MessageCircle size={20} /></span>
      <span className="support-txt">
        <b>Liên hệ hỗ trợ qua Zalo</b>
        <small>Hướng dẫn, báo lỗi, đổi mật khẩu · Zalo {pretty(SUPPORT)}</small>
      </span>
      <ChevronRight size={18} />
    </button>
  );
}

/** Dòng nhỏ ở màn đăng nhập */
export function SupportLink() {
  if (!SUPPORT) return null;
  return <button type="button" className="support-link" onClick={() => openSupport('')}>Cần hỗ trợ? Chat Zalo {pretty(SUPPORT)}</button>;
}
