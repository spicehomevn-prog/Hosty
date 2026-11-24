import { useMemo, useRef, useState } from 'react';
import { Upload, AlertCircle, CheckCircle2 } from '../lib/icons.jsx';
import { useStore, platformColor } from '../lib/store.jsx';
import { useFinance } from '../lib/finance.jsx';
import { getBookings, allRooms } from '../lib/derive.js';
import { readRows, detect, toBookings, guessRoom, FIELD_LABEL } from '../lib/report.js';
import { fmtVND } from '../lib/money.js';
import { planReportImport } from '../lib/fin.js';
import { DirectImport } from './DirectImport.jsx';
import { DIRECT } from '../lib/directPrices.js';
import { dm } from '../lib/dates.js';
import { Sheet, Field, MoneyInput, toast } from './ui.jsx';

const GUIDE = {
  Airbnb: 'Airbnb → Hôm nay / Thu nhập → Lịch sử giao dịch → Xuất file CSV (hoặc Đặt phòng → Xuất).',
  'Booking.com': 'Extranet Booking.com → Đặt phòng → chọn khoảng ngày → Tải xuống (Excel / CSV).',
  Agoda: 'Agoda YCS → Đặt phòng → chọn khoảng ngày → Xuất file (Excel / CSV).',
};
const MAP_FIELDS = ['checkin', 'checkout', 'nights', 'amount', 'fee', 'code', 'listing', 'guest', 'status'];

export function ImportReport({ onClose, month }) {
  const { state, user } = useStore();
  const { fin, dispatch } = useFinance();
  const fileRef = useRef(null);
  const platforms = [DIRECT, 'Airbnb', 'Booking.com', 'Agoda', ...new Set(state.calendars.map((c) => c.platform).filter((p) => p && ![DIRECT, 'Airbnb', 'Booking.com', 'Agoda'].includes(p)))];
  const [platform, setPlatform] = useState(platforms[1]);
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState(null);
  const [det, setDet] = useState(null);
  const [err, setErr] = useState('');
  const [roomOf, setRoomOf] = useState({});
  const [rate, setRate] = useState(null);
  const rooms = useMemo(() => allRooms(state), [state]);

  const parsed = useMemo(() => (rows && det ? toBookings(rows, det, platform) : null), [rows, det, platform]);
  const listings = useMemo(() => [...new Set((parsed?.bookings || []).map((b) => b.listing))], [parsed]);
  const foreign = parsed?.bookings.find((b) => b.cur && b.cur !== 'VND')?.cur || null;

  const pick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setErr(''); setFile(f); setRows(null); setDet(null);
    try {
      const r = await readRows(f);
      const d = detect(r);
      if (d.map.checkin == null || d.map.amount == null) throw new Error('Không tìm thấy cột ngày nhận phòng và cột giá trong file. Kiểm tra lại file xuất từ sàn.');
      setRows(r); setDet(d);
      const saved = fin.roomMap?.[platform] || {};
      const tmp = toBookings(r, d, platform).bookings;
      const init = {};
      for (const l of new Set(tmp.map((b) => b.listing))) init[l] = saved[l] ?? guessRoom(l, rooms) ?? '';
      setRoomOf(init);
    } catch (ex) { setErr(ex.message || 'Không đọc được file'); }
  };

  const heads = rows && det ? rows[det.header].map((h, i) => ({ i, name: String(h || `Cột ${i + 1}`) })) : [];
  const setCol = (f, v) => setDet({ ...det, map: { ...det.map, [f]: v === '' ? undefined : Number(v) } });

  const plan = useMemo(() => {
    if (!parsed) return null;
    const mul = foreign ? rate : 1;
    return planReportImport(parsed.bookings, { platform, roomOf, bookings: getBookings(state), prices: fin.prices || {}, mul: mul || 1, by: user?.name || '' });
  }, [parsed, platform, roomOf, state, fin.prices, foreign, rate, user?.name]);

  const run = () => {
    if (!plan || (foreign && !rate)) return;
    dispatch({ type: 'PRICES', entries: plan.entries });
    dispatch({ type: 'ROOMMAP', platform, map: roomOf });
    const s = plan.summary;
    toast([s.updated && `Đã cập nhật ${s.updated} booking ${platform}`, s.added && `thêm ${s.added} đặt phòng cũ`].filter(Boolean).join(' · ') || 'Không có gì để nhập');
    onClose();
  };

  const total = parsed?.bookings.reduce((a, b) => a + b.amount, 0) || 0;
  const skippedN = parsed ? parsed.skipped.cancelled + parsed.skipped.other + parsed.skipped.invalid : 0;
  const chips = (
    <Field label="Kênh">
      <div className="chip-row">
        {platforms.map((p) => (
          <button key={p} type="button" className={`mini-chip ${platform === p ? 'on' : ''}`} style={{ '--pc': platformColor(p) }} onClick={() => { setPlatform(p); setRows(null); setDet(null); setFile(null); }}>{p}</button>
        ))}
      </div>
    </Field>
  );
  // kênh Trực tiếp: form Excel mẫu theo tháng -> điền -> tải lên
  if (platform === DIRECT) return <DirectImport month={month || new Date().toISOString().slice(0, 7)} chips={chips} onClose={onClose} />;
  return (
    <Sheet open onClose={onClose} title="Nhập file báo cáo từ sàn"
      footer={parsed ? <button className="btn primary block" disabled={!parsed.bookings.length || (foreign && !rate)} onClick={run}>Nhập {parsed.bookings.length} đặt phòng</button> : null}>
      {chips}
      {GUIDE[platform] && <p className="fin-note">{GUIDE[platform]}</p>}
      <button className="drop" onClick={() => fileRef.current?.click()}>
        <Upload size={22} />
        <b>{file ? file.name : 'Chọn file CSV hoặc Excel (.xlsx)'}</b>
        <small>{file ? 'Bấm để chọn file khác' : 'File được đọc ngay trên máy, không gửi lên máy chủ'}</small>
      </button>
      <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,text/csv" hidden onChange={pick} />
      {err && <p className="form-error"><AlertCircle size={15} /> {err}</p>}

      {parsed && (
        <>
          <div className="imp-sum">
            <CheckCircle2 size={18} />
            <span><b>{parsed.bookings.length} đặt phòng · {fmtVND(total)}{foreign ? ` (${foreign})` : ''}</b>
              <small>{skippedN ? `Bỏ qua ${skippedN} dòng: ${parsed.skipped.cancelled} đã huỷ, ${parsed.skipped.other} không phải đặt phòng, ${parsed.skipped.invalid} thiếu ngày/giá` : 'Không có dòng nào bị bỏ qua'}</small></span>
          </div>
          {foreign && (
            <Field label={`Tỉ giá: 1 ${foreign} = ? ₫`} hint="File báo cáo dùng ngoại tệ, cần đổi sang VND">
              <MoneyInput value={rate} onChange={setRate} placeholder="VD: 25.400" />
            </Field>
          )}

          <h4 className="fin-h">Ghép phòng</h4>
          {listings.map((l) => (
            <div key={l || '-'} className="imp-map">
              <span>{l || '(file không có cột listing)'}</span>
              <select className="input sm" value={roomOf[l] || ''} onChange={(e) => setRoomOf({ ...roomOf, [l]: e.target.value })}>
                <option value="">Không gắn phòng</option>
                {state.locations.map((loc) => (
                  <optgroup key={loc.id} label={loc.name}>{loc.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</optgroup>
                ))}
              </select>
            </div>
          ))}
          {plan && (
            <div className="imp-plan">
              {plan.summary.updated > 0 && <p><b>{plan.summary.updated}</b> booking {platform} trên lịch sẽ được cập nhật doanh thu theo file{plan.summary.replacedManual ? ` (trong đó ${plan.summary.replacedManual} giá nhập tay được thay bằng số trong file)` : ''}</p>}
              {plan.summary.added > 0 && <p><b>{plan.summary.added}</b> đặt phòng không còn trên lịch → thêm vào sổ{plan.summary.noRoom ? ` · ${plan.summary.noRoom} dòng chưa gắn phòng (chọn phòng ở trên)` : ''}</p>}
              <p className="muted">Không thay đổi đặt phòng trực tiếp và các sàn khác.</p>
            </div>
          )}

          <details className="imp-cols">
            <summary>Cột trong file (tự nhận · bấm để sửa)</summary>
            {MAP_FIELDS.map((f) => (
              <label key={f} className="imp-map">
                <span>{FIELD_LABEL[f]}</span>
                <select className="input sm" value={det.map[f] ?? ''} onChange={(e) => setCol(f, e.target.value)}>
                  <option value="">—</option>
                  {heads.map((h) => <option key={h.i} value={h.i}>{h.name}</option>)}
                </select>
              </label>
            ))}
          </details>

          <h4 className="fin-h">Xem trước</h4>
          <div className="imp-list">
            {(plan?.items || parsed.bookings).slice(0, 6).map((b, i) => (
              <div key={i} className="imp-row">
                <span>
                  <b>{dm(b.start)} → {dm(b.end)} {b.kind && <em className={`imp-tag ${b.kind}`}>{b.kind === 'update' ? 'cập nhật' : 'thêm mới'}</em>}</b>
                  <small>{[b.code, b.listing, b.guest].filter(Boolean).join(' · ')}</small>
                </span>
                <span className="imp-amt">
                  <b>{foreign ? `${b.raw ?? b.amount} ${b.cur}` : fmtVND(b.amount)}</b>
                  {b.kind === 'update' && b.oldAmount != null && b.oldAmount !== b.amount && <small>trước: {fmtVND(b.oldAmount)}</small>}
                  {b.fee != null && <small>phí {foreign ? b.fee : fmtVND(b.fee)}</small>}
                </span>
              </div>
            ))}
            {parsed.bookings.length > 6 && <p className="tiny muted center">… và {parsed.bookings.length - 6} đặt phòng khác</p>}
          </div>
        </>
      )}
    </Sheet>
  );
}
