import { useMemo, useRef, useState } from 'react';
import { Upload, Download, AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Loader2 } from '../lib/icons.jsx';
import { useStore } from '../lib/store.jsx';
import { useFinance } from '../lib/finance.jsx';
import { useSession } from '../lib/session.jsx';
import { getBookings, roomIndex } from '../lib/derive.js';
import { readRows } from '../lib/report.js';
import { directRows, downloadTemplate, parseDirect, planDirect } from '../lib/directPrices.js';
import { fmtVND } from '../lib/money.js';
import { dm, addMonths } from '../lib/dates.js';
import { Sheet, toast } from './ui.jsx';

/**
 * Nhập giá đặt phòng kênh Trực tiếp bằng Excel: tải form mẫu của tháng -> điền -> tải lên -> tự điền giá.
 * `chips`: hàng chọn sàn của sheet nhập file (để chuyển qua lại).
 */
export function DirectImport({ month: m0, chips, onClose }) {
  const { state, user } = useStore();
  const { fin, dispatch } = useFinance();
  const { workspace } = useSession();
  const [m, setM] = useState(m0);
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const bookings = useMemo(() => getBookings(state), [state]);
  const rooms = useMemo(() => Object.fromEntries(Object.entries(roomIndex(state)).map(([id, v]) => [id, v.room.name])), [state]);
  const rows = useMemo(() => directRows(bookings, fin, m, rooms), [bookings, fin, m, rooms]);
  const plan = useMemo(() => (parsed ? planDirect(parsed, bookings, fin.prices || {}, user?.name || '') : null), [parsed, bookings, fin.prices, user?.name]);
  const [y, mo] = m.split('-');

  const download = async () => {
    setBusy(true); setErr('');
    try { const name = await downloadTemplate(rows, m, workspace?.name || state.property?.name || ''); toast(`Đã tải ${name}`); } catch (e) { setErr(e.message || 'Không tạo được file'); }
    setBusy(false);
  };
  const pick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setErr(''); setFile(f); setParsed(null);
    try {
      const r = await readRows(f);
      const p = parseDirect(r);
      if (!p.length) throw new Error('File không có dòng đặt phòng nào (cột "Mã" trống)');
      setParsed(p);
    } catch (ex) { setErr(ex.message || 'Không đọc được file'); }
  };
  const apply = () => {
    if (!plan?.summary.updated) return;
    dispatch({ type: 'PRICES', entries: plan.entries });
    toast(`Đã điền giá cho ${plan.summary.updated} đặt phòng trực tiếp`);
    onClose();
  };
  const s = plan?.summary;

  return (
    <Sheet open onClose={onClose} title="Nhập file báo cáo từ sàn"
      footer={plan ? <button className="btn primary block" disabled={!s.updated} onClick={apply}>{s.updated ? `Điền giá ${s.updated} đặt phòng` : 'Không có gì thay đổi'}</button> : null}>
      {chips}
      <div className="di-step">
        <span className="di-num">1</span>
        <div>
          <b>Tải form mẫu của tháng</b>
          <div className="di-month">
            <button className="icon-btn sm" onClick={() => { setM(addMonths(`${m}-01`, -1).slice(0, 7)); setParsed(null); }} aria-label="Tháng trước"><ChevronLeft size={16} /></button>
            <span>Tháng {Number(mo)}/{y}</span>
            <button className="icon-btn sm" onClick={() => { setM(addMonths(`${m}-01`, 1).slice(0, 7)); setParsed(null); }} aria-label="Tháng sau"><ChevronRight size={16} /></button>
          </div>
          <small>{rows.length ? `${rows.length} đặt phòng trực tiếp · ${rows.filter((r) => r.base == null).length} chưa có giá` : 'Tháng này chưa có đặt phòng trực tiếp'}</small>
          <button className="btn ghost" onClick={download} disabled={busy || !rows.length}>
            {busy ? <Loader2 size={16} className="spin" /> : <Download size={16} />} Tải form Excel tháng {Number(mo)}/{y}
          </button>
        </div>
      </div>
      <div className="di-step">
        <span className="di-num">2</span>
        <div><b>Điền giá trong Excel</b><small>Điền các cột màu tím (giá phòng, giảm giá, dịch vụ, đã cọc, đã thu đủ). Không sửa cột "Mã".</small></div>
      </div>
      <div className="di-step">
        <span className="di-num">3</span>
        <div style={{ flex: 1 }}>
          <b>Tải file đã điền lên</b>
          <button className="drop" onClick={() => fileRef.current?.click()}>
            <Upload size={22} />
            <b>{file ? file.name : 'Chọn file Excel (.xlsx) đã điền'}</b>
            <small>{file ? 'Bấm để chọn file khác' : 'File được đọc ngay trên máy, không gửi lên máy chủ'}</small>
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.csv" hidden onChange={pick} />
        </div>
      </div>
      {err && <p className="form-error"><AlertCircle size={15} /> {err}</p>}

      {plan && (
        <>
          <div className="imp-plan">
            {s.updated > 0 && <p><b>{s.updated}</b> đặt phòng trực tiếp sẽ được điền / cập nhật giá</p>}
            {s.unchanged > 0 && <p className="muted">{s.unchanged} dòng giữ nguyên (giá không đổi)</p>}
            {s.notFound > 0 && <p className="bad">{s.notFound} dòng có "Mã" không khớp đặt phòng trực tiếp nào – bỏ qua</p>}
            {s.invalid > 0 && <p className="bad">{s.invalid} dòng lỗi – bỏ qua (xem bên dưới)</p>}
            <p className="muted">Chỉ điền giá đặt phòng kênh Trực tiếp – không đụng dữ liệu các sàn.</p>
          </div>
          <div className="imp-list">
            {plan.items.filter((it) => it.status !== 'same').slice(0, 12).map((it, i) => (
              <div key={i} className="imp-row">
                <span>
                  <b>{it.b ? `${rooms[it.b.roomId] || ''} · ${dm(it.b.start)} → ${dm(it.b.end)}` : `Dòng ${it.row} · mã ${it.id}`}
                    {' '}<em className={`imp-tag ${it.status === 'update' ? 'update' : 'add'}`}>{it.status === 'update' ? 'cập nhật' : it.status === 'notFound' ? 'không khớp' : 'lỗi'}</em></b>
                  <small>{it.b?.guest || ''}{it.why ? ` · ${it.why}` : ''}</small>
                </span>
                {it.status === 'update' && (
                  <span className="imp-amt"><b>{fmtVND(it.newTotal)}</b>{it.oldTotal != null && it.oldTotal !== it.newTotal && <small>trước: {fmtVND(it.oldTotal)}</small>}{it.entry.deposit > 0 && <small>cọc {fmtVND(it.entry.deposit)}</small>}</span>
                )}
              </div>
            ))}
          </div>
          {s.updated > 0 && <p className="tiny muted"><CheckCircle2 size={13} /> Bấm nút bên dưới để lưu. Tổng = tiền phòng sau giảm + dịch vụ.</p>}
        </>
      )}
    </Sheet>
  );
}
