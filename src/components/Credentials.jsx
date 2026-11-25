import { Copy, KeyRound } from '../lib/icons.jsx';
import { copyText } from '../lib/derive.js';
import { roleLabel } from '../lib/perm.js';
import { Sheet, toast } from './ui.jsx';

/** Thẻ thông tin đăng nhập (sau khi tạo tài khoản / đặt lại mật khẩu) */
export function CredentialsSheet({ data, onClose }) {
  if (!data) return null;
  const { account, password, workspaceName } = data;
  const text = [
    `Hostexa – ${workspaceName || ''}`.trim(),
    `Link: ${location.origin}`,
    `Tài khoản: ${account.username}`,
    `Mật khẩu: ${password}`,
    `Vai trò: ${roleLabel(account.role, account.kind)}`,
  ].join('\n');
  return (
    <Sheet open onClose={onClose} title="Thông tin đăng nhập"
      footer={<button className="btn primary block" onClick={async () => toast((await copyText(text)) ? 'Đã copy, dán vào Zalo để gửi' : 'Không copy được')}><Copy size={16} /> Copy để gửi</button>}>
      <div className="cred-card">
        <span className="cred-ico"><KeyRound size={20} /></span>
        <dl>
          <dt>Cơ sở</dt><dd>{workspaceName}</dd>
          <dt>Vai trò</dt><dd>{roleLabel(account.role, account.kind)}</dd>
          <dt>Tên đăng nhập</dt><dd className="mono">{account.username}</dd>
          <dt>Mật khẩu</dt><dd className="mono">{password}</dd>
        </dl>
      </div>
      <p className="tiny muted">Mật khẩu chỉ hiện một lần. Người dùng có thể tự đổi mật khẩu sau khi đăng nhập (Cơ sở → Tài khoản).</p>
    </Sheet>
  );
}
