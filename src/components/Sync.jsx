import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Cloud, Copy, Share2, RefreshCw, Download, Upload, AlertTriangle, Link2, Search, CheckCircle2, Unlink } from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import { uploadPack, fetchPack, fetchPackMeta, packData, formatCode, cleanCode, isCode, syncLink } from '../lib/sync.js';
import { copyText } from '../lib/derive.js';
import { Sheet, toast } from './ui.jsx';

const pad = (n) => String(n).padStart(2, '0');
export const fmtTime = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const isDirty = (state) => !!state.syncMeta?.code && (state.editedAt || 0) > (state.syncMeta.at || 0);

/** Thẻ "Đồng bộ sang máy khác" trong trang Cơ sở */
export function SyncCard({ onImport }) {
  const { state, dispatch } = useStore();
  const { code, version } = state.syncMeta || {};
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [conflict, setConflict] = useState(null);
  const [qr, setQr] = useState('');

  useEffect(() => {
    if (!code) { setQr(''); return; }
    QRCode.toString(syncLink(code), { type: 'svg', margin: 1, color: { dark: '#1D1530', light: '#FFFFFF' } }).then(setQr).catch(() => setQr(''));
  }, [code]);

  const pack = async (force = false, fresh = false) => {
    setBusy('pack'); setErr(''); setConflict(null);
    try {
      const r = await uploadPack({ data: packData(state), code: fresh ? '' : code, baseVersion: version, force });
      dispatch({ type: 'SYNC_META', patch: { code: r.code, version: r.updatedAt, at: r.updatedAt } });
      toast(code && !fresh ? 'Đã cập nhật gói dữ liệu' : 'Đã đóng gói · tạo mã đồng bộ');
    } catch (e) {
      if (e.status === 409) setConflict(e.info);
      else if (e.status === 404 && code) setErr('Mã này không còn trên máy chủ. Bấm "Tạo mã mới".');
      else setErr(e.message);
    }
    setBusy('');
  };

  const pull = async () => {
    if (isDirty(state) && !window.confirm('Máy này có thay đổi chưa cập nhật lên gói. Tải bản trên máy chủ về sẽ thay thế các thay đổi đó. Tiếp tục?')) return;
    setBusy('pull'); setErr(''); setConflict(null);
    try {
      const r = await fetchPack(code);
      dispatch({ type: 'IMPORT_PACK', data: r.data, code: r.code, version: r.updatedAt });
      toast('Đã tải dữ liệu mới nhất');
    } catch (e) { setErr(e.message); }
    setBusy('');
  };

  const share = async () => {
    const text = `Mã đồng bộ Hosty: ${formatCode(code)}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Hosty', text, url: syncLink(code) }); return; } catch { /* người dùng huỷ */ return; }
    }
    const ok = await copyText(`${text}\n${syncLink(code)}`);
    toast(ok ? 'Đã copy mã và link' : 'Không copy được');
  };

  return (
    <div className="sync-card">
      <div className="sync-head">
        <span className="sync-ico"><Cloud size={20} /></span>
        <div>
          <b>Đồng bộ sang máy khác</b>
          <small>Đóng gói dữ liệu, mở trên máy khác bằng mã hoặc QR</small>
        </div>
      </div>

      {!code ? (
        <>
          <p className="tiny muted">Toàn bộ cơ sở, phòng, lịch iCal, đặt phòng thủ công, ghi chú, task và trạng thái dọn phòng sẽ được đóng gói lên máy chủ. Bạn nhận một mã 8 ký tự để mở trên điện thoại / máy tính khác.</p>
          <button className="btn primary block" onClick={() => pack()} disabled={!!busy}>
            {busy === 'pack' ? <RefreshCw size={16} className="spin" /> : <Upload size={16} />} Đóng gói & tạo mã
          </button>
        </>
      ) : (
        <>
          <div className="sync-code-row">
            <div className="sync-qr" aria-label="Mã QR đồng bộ" role="img" dangerouslySetInnerHTML={{ __html: qr }} />
            <div className="sync-code-box">
              <span className="tiny muted">Mã đồng bộ</span>
              <b className="sync-code">{formatCode(code)}</b>
              <div className="row gap8">
                <button className="btn tiny" onClick={async () => toast((await copyText(formatCode(code))) ? 'Đã copy mã' : 'Không copy được')}><Copy size={14} /> Copy</button>
                <button className="btn tiny" onClick={share}><Share2 size={14} /> Gửi</button>
              </div>
            </div>
          </div>
          <p className="tiny muted">Quét QR bằng camera điện thoại, hoặc mở Hosty trên máy khác → <b>Cơ sở → Nhận dữ liệu</b> và nhập mã.</p>
          <p className={`sync-status ${isDirty(state) ? 'dirty' : ''}`}>
            {isDirty(state) ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
            {isDirty(state) ? 'Có thay đổi chưa cập nhật lên gói' : `Gói cập nhật lúc ${fmtTime(version)}`}
          </p>
          <div className="row gap8 wrap">
            <button className="btn primary" onClick={() => pack()} disabled={!!busy}>
              {busy === 'pack' ? <RefreshCw size={16} className="spin" /> : <Upload size={16} />} Cập nhật gói
            </button>
            <button className="btn ghost" onClick={pull} disabled={!!busy}>
              {busy === 'pull' ? <RefreshCw size={16} className="spin" /> : <Download size={16} />} Tải bản mới nhất
            </button>
          </div>
          <div className="row gap8 wrap sync-minor">
            <button className="link-btn" onClick={() => pack(false, true)} disabled={!!busy}><Link2 size={13} /> Tạo mã mới</button>
            <button className="link-btn" onClick={() => { if (window.confirm('Ngừng dùng mã này trên máy này? Dữ liệu trên máy vẫn giữ nguyên.')) dispatch({ type: 'SYNC_META', patch: { code: '', version: 0, at: 0 } }); }}><Unlink size={13} /> Ngừng đồng bộ</button>
          </div>
        </>
      )}

      {conflict && (
        <div className="sync-conflict">
          <AlertTriangle size={16} />
          <div>
            <b>Gói trên máy chủ mới hơn</b>
            <span>Được cập nhật lúc {fmtTime(conflict.updatedAt)}{conflict.device ? ` từ ${conflict.device}` : ''}.</span>
            <div className="row gap8 wrap">
              <button className="btn tiny" onClick={pull}>Tải bản đó về</button>
              <button className="btn tiny danger" onClick={() => pack(true)}>Vẫn ghi đè</button>
            </div>
          </div>
        </div>
      )}
      {err && <p className="form-error">{err}</p>}

      <button className="btn ghost block sync-import" onClick={() => onImport('')}><Download size={16} /> Nhận dữ liệu từ máy khác</button>
    </div>
  );
}

/** Bảng nhập mã để nhận dữ liệu */
export function ImportSheet({ initialCode = '', onClose, onImported }) {
  const { state, dispatch } = useStore();
  const [code, setCode] = useState(formatCode(initialCode));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [pack, setPack] = useState(null);

  const find = async (c = code) => {
    if (!isCode(c)) { setErr('Mã gồm 8 ký tự, ví dụ ABCD-2345'); return; }
    setBusy(true); setErr(''); setPack(null);
    try { setPack(await fetchPack(c)); } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  useEffect(() => { if (isCode(initialCode)) find(initialCode); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const use = () => {
    dispatch({ type: 'IMPORT_PACK', data: pack.data, code: pack.code, version: pack.updatedAt });
    toast(`Đã nhận dữ liệu ${pack.data.property?.name || ''}`);
    onImported?.();
    onClose();
  };

  const d = pack?.data;
  const rooms = d ? d.locations.reduce((s, l) => s + (l.rooms?.length || 0), 0) : 0;
  const hasLocal = state.setupDone && state.locations.length > 0;

  return (
    <Sheet open onClose={onClose} title="Nhận dữ liệu từ máy khác"
      footer={pack
        ? <button className="btn primary block" onClick={use}><Download size={16} /> Dùng dữ liệu này</button>
        : <button className="btn primary block" onClick={() => find()} disabled={busy || cleanCode(code).length < 8}>{busy ? <RefreshCw size={16} className="spin" /> : <Search size={16} />} Tìm gói dữ liệu</button>}>
      <p className="tiny muted" style={{ marginBottom: 12 }}>Nhập mã đồng bộ 8 ký tự đã tạo trên máy kia (Cơ sở → Đồng bộ sang máy khác).</p>
      <input
        className="input xl code-input"
        autoFocus
        inputMode="text"
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        placeholder="ABCD-2345"
        value={code}
        onChange={(e) => { setCode(formatCode(e.target.value)); setPack(null); setErr(''); }}
        onKeyDown={(e) => e.key === 'Enter' && find()}
        aria-label="Mã đồng bộ"
      />
      {err && <p className="form-error">{err}</p>}
      {pack && (
        <div className="pack-preview">
          <b>{d.property?.name || 'Cơ sở chưa đặt tên'}</b>
          <span>{d.locations.length} địa điểm · {rooms} phòng · {(d.calendars || []).length} lịch iCal · {(d.tasks || []).length} task</span>
          <small>Cập nhật lúc {fmtTime(pack.updatedAt)}{pack.device ? ` · từ ${pack.device}` : ''}</small>
          {hasLocal && <p className="pack-warn"><AlertTriangle size={14} /> Dữ liệu hiện có trên máy này ({state.property.name}) sẽ được thay thế.</p>}
        </div>
      )}
    </Sheet>
  );
}

/** Thông báo ở Tổng quan khi máy khác đã cập nhật gói mới hơn */
export function SyncBanner() {
  const { state, dispatch } = useStore();
  const { code, version } = state.syncMeta || {};
  const [remote, setRemote] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!code) return;
    let alive = true;
    fetchPackMeta(code).then((m) => { if (alive && m.updatedAt > (version || 0)) setRemote(m); }).catch(() => {});
    return () => { alive = false; };
  }, [code, version]);
  if (!remote) return null;
  const pull = async () => {
    if (isDirty(state) && !window.confirm('Máy này có thay đổi chưa cập nhật lên gói. Tải bản mới về sẽ thay thế các thay đổi đó. Tiếp tục?')) return;
    setBusy(true);
    try {
      const r = await fetchPack(code);
      dispatch({ type: 'IMPORT_PACK', data: r.data, code: r.code, version: r.updatedAt });
      toast('Đã tải dữ liệu mới nhất');
      setRemote(null);
    } catch (e) { toast(e.message); }
    setBusy(false);
  };
  return (
    <button className="alert info rise" onClick={pull} disabled={busy}>
      {busy ? <RefreshCw size={18} className="spin" /> : <Cloud size={18} />}
      <span>Có dữ liệu mới {remote.device ? `từ ${remote.device}` : ''} lúc {fmtTime(remote.updatedAt)} · Bấm để tải về</span>
    </button>
  );
}
