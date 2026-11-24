import { useEffect, useMemo, useState } from 'react';
import { Trash2, Pricing, RefreshCw, CheckCircle2, AlertCircle, Link2, Plus } from '../lib/icons.jsx';
import { useStore, uid, platformColor } from '../lib/store.jsx';
import { useFinance } from '../lib/finance.jsx';
import { useSession } from '../lib/session.jsx';
import { roomIndex } from '../lib/derive.js';
import { useMembers } from '../lib/members.js';
import { rateEstimate, feePct, EXPENSE_GROUPS, platformOrder, DEFAULT_FEES, applyDiscount } from '../lib/fin.js';
import { fmtVND } from '../lib/money.js';
import { dm, diffDays, todayKey, monthTitle, timeAgo } from '../lib/dates.js';
import { Sheet, Field, MoneyInput, DiscountInput, toast } from './ui.jsx';

/* ---------- Giá của một đặt phòng từ sàn ---------- */
export function PriceSheet({ b, onClose }) {
  const { state, user } = useStore();
  const { fin, dispatch } = useFinance();
  const info = roomIndex(state)[b.roomId];
  const entry = fin.prices?.[b.id];
  const est = rateEstimate(b, fin);
  const manualEntry = entry && entry.source === 'manual';
  // giá gốc: mục nhập tay giữ base của nó; còn lại bắt đầu từ giá sau giảm theo bảng giá / file
  const [base, setBase] = useState(manualEntry ? entry.base ?? entry.amount : entry?.amount ?? est?.amount ?? null);
  const [discount, setDiscount] = useState(manualEntry ? entry.discount || null : null);
  const [fee, setFee] = useState(entry?.fee ?? null);
  const pct = feePct(fin, b.platform);
  const nights = diffDays(b.start, b.end);
  const amount = applyDiscount(base, discount);
  const ok = base != null && base > 0;
  const save = () => {
    if (!ok) return;
    const disc = discount?.value ? discount : null;
    dispatch({
      type: 'PRICE', id: b.id,
      entry: {
        roomId: b.roomId, platform: b.platform, guest: entry?.guest || '', start: b.start, end: b.end, amount,
        ...(disc ? { base, discount: disc } : {}), ...(fee != null ? { fee } : {}), source: 'manual', at: Date.now(), by: user?.name || '',
      },
    });
    toast('Đã lưu giá');
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title={entry ? 'Sửa giá đặt phòng' : 'Nhập giá đặt phòng'}
      footer={<>
        {entry && <button className="icon-btn danger" aria-label="Xoá giá" onClick={() => { dispatch({ type: 'PRICE', id: b.id, entry: null }); toast('Đã xoá giá'); onClose(); }}><Trash2 size={18} /></button>}
        <button className="btn primary block" disabled={!ok} onClick={save}>Lưu giá</button>
      </>}>
      <div className="fin-bk" style={{ '--bc': platformColor(b.platform) }}>
        <span className="pdot lg" style={{ background: platformColor(b.platform) }} />
        <div><b>{info?.room.name || 'Phòng'} · {b.platform}</b><small>{dm(b.start)} → {dm(b.end)} · {nights} đêm</small></div>
      </div>
      {est && (
        <div className="calc-lines">
          <div><span>{est.otaNights === est.nights ? `Theo giá ${b.platform} (Apify)` : est.otaNights ? `Giá ${b.platform} ${est.otaNights} đêm + bảng giá ${est.nights - est.otaNights} đêm` : 'Theo bảng giá'} ({nights} đêm)</span><b>{fmtVND(est.base)}</b></div>
          {est.dayOff > 0 && <div className="off"><span>Giảm giá theo ngày</span><b>−{fmtVND(est.dayOff)}</b></div>}
          {est.stayOff > 0 && <div className="off"><span>Giảm ở dài ngày ({est.stayPct}%)</span><b>−{fmtVND(est.stayOff)}</b></div>}
          <div className="tot"><span>Giá tính được</span><b>{fmtVND(est.amount)}</b></div>
        </div>
      )}
      <Field label={<>Giá phòng (trước giảm giá riêng) <em className="req">*</em></>}>
        <MoneyInput value={base} onChange={setBase} invalid={!ok} autoFocus />
      </Field>
      <Field label="Giảm giá cho đặt phòng này"><DiscountInput value={discount} onChange={setDiscount} /></Field>
      {ok && <div className="pay-sum"><small>Khách trả{base !== amount ? ` · đã giảm ${fmtVND(base - amount)}` : ''}</small><b>{fmtVND(amount)}</b></div>}
      <Field label="Phí sàn thực tế" hint={`Để trống thì tính ${pct}% trên giá sau giảm = ${fmtVND(Math.round((amount * pct) / 100))}`}>
        <MoneyInput value={fee} onChange={setFee} placeholder={`${pct}% giá phòng`} />
      </Field>
    </Sheet>
  );
}

/* ---------- Khoản chi: lương / chi phí khác ---------- */
export function ExpenseSheet({ expense, month, onClose }) {
  const { fin, dispatch } = useFinance();
  const members = useMembers();
  const today = todayKey();
  const defDate = month && month !== today.slice(0, 7) ? `${month}-01` : today;
  const [x, setX] = useState(() => ({ id: '', kind: 'other', group: 'Điện nước', title: '', staffName: '', amount: null, date: defDate, monthly: false, until: '', note: '', ...expense }));
  const set = (k) => (e) => setX({ ...x, [k]: e.target.value });
  const isSalary = x.kind === 'salary';
  const ok = x.amount > 0 && x.date && (isSalary ? x.staffName.trim() : x.title.trim() || x.group);
  const staff = useMemo(() => {
    const names = new Set(members.map((m) => m.name).filter(Boolean));
    for (const e of fin.expenses) if (e.kind === 'salary' && e.staffName) names.add(e.staffName);
    return [...names];
  }, [members, fin.expenses]);
  const save = () => {
    if (!ok) return;
    const clean = { ...x, id: x.id || uid(), title: x.title.trim() || (isSalary ? 'Lương' : x.group), group: isSalary ? 'Lương' : x.group };
    if (isSalary || !clean.monthly) { delete clean.monthly; delete clean.until; }
    if (!clean.until) delete clean.until;
    dispatch({ type: 'SAVE_EXPENSE', expense: clean });
    toast('Đã lưu khoản chi');
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title={x.id ? 'Sửa khoản chi' : 'Thêm khoản chi'}
      footer={<>
        {x.id && <button className="icon-btn danger" aria-label="Xoá" onClick={() => { dispatch({ type: 'DELETE_EXPENSE', id: x.id }); toast('Đã xoá khoản chi'); onClose(); }}><Trash2 size={18} /></button>}
        <button className="btn primary block" disabled={!ok} onClick={save}>Lưu khoản chi</button>
      </>}>
      <div className="seg wide fin-seg">
        <button type="button" className={isSalary ? 'on' : ''} onClick={() => setX({ ...x, kind: 'salary' })}>Lương nhân viên</button>
        <button type="button" className={!isSalary ? 'on' : ''} onClick={() => setX({ ...x, kind: 'other' })}>Chi phí khác</button>
      </div>
      {isSalary ? (
        <>
          <Field label={<>Nhân viên <em className="req">*</em></>}>
            <input className="input" list="fin-staff" value={x.staffName} onChange={set('staffName')} placeholder="VD: Chị Hoa (dọn phòng)" />
            <datalist id="fin-staff">{staff.map((n) => <option key={n} value={n} />)}</datalist>
          </Field>
          <Field label="Nội dung"><input className="input" value={x.title} onChange={set('title')} placeholder="Lương tháng, thưởng, tăng ca…" /></Field>
        </>
      ) : (
        <>
          <Field label="Nhóm">
            <div className="chip-row">
              {EXPENSE_GROUPS.map((g) => <button key={g} type="button" className={`mini-chip ${x.group === g ? 'on' : ''}`} style={{ '--pc': '#6B4FD8' }} onClick={() => setX({ ...x, group: g })}>{g}</button>)}
            </div>
          </Field>
          <Field label="Nội dung"><input className="input" value={x.title} onChange={set('title')} placeholder="VD: Tiền điện tháng 11" /></Field>
        </>
      )}
      <div className="grid2">
        <Field label={<>Số tiền <em className="req">*</em></>}><MoneyInput value={x.amount} onChange={(v) => setX({ ...x, amount: v })} /></Field>
        <Field label={isSalary ? 'Ngày trả' : 'Ngày chi'}><input type="date" className="input" value={x.date} onChange={set('date')} /></Field>
      </div>
      {!isSalary && (
        <label className="fin-check">
          <input type="checkbox" checked={!!x.monthly} onChange={(e) => setX({ ...x, monthly: e.target.checked })} />
          <span><b>Lặp lại hằng tháng</b><small>Tự cộng vào mỗi tháng từ {x.date ? monthTitle(x.date).toLowerCase() : 'tháng này'} (tiền thuê nhà, internet…)</small></span>
        </label>
      )}
      {!isSalary && x.monthly && (
        <Field label="Đến tháng (để trống nếu vẫn đang trả)"><input type="month" className="input" value={x.until || ''} onChange={set('until')} /></Field>
      )}
      <Field label="Ghi chú"><textarea className="input" rows={2} value={x.note} onChange={set('note')} /></Field>
    </Sheet>
  );
}

/** Các sàn đang dùng ở cơ sở (kèm "Trực tiếp") */
export function usePlatforms(extra = []) {
  const { state } = useStore();
  return useMemo(() => platformOrder(new Set([...state.calendars.map((c) => c.platform), 'Trực tiếp', ...extra])), [state.calendars, extra.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
}

/* ---------- Số tổng cho tháng trước khi dùng hệ thống ---------- */
export function HistorySheet({ month, onClose }) {
  const { user } = useStore();
  const { fin, dispatch } = useFinance();
  const cur = fin.history?.[month];
  const platforms = usePlatforms(Object.keys(cur?.revenue || {}));
  const [rev, setRev] = useState(() => ({ ...(cur?.revenue || {}) }));
  const [fees, setFees] = useState(() => ({ ...(cur?.fees || {}) }));
  const [note, setNote] = useState(cur?.note || '');
  const total = Object.values(rev).reduce((a, v) => a + (Number(v) || 0), 0);
  const save = () => {
    const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== ''));
    dispatch({ type: 'HISTORY', month, entry: { revenue: clean(rev), fees: clean(fees), note, at: Date.now(), by: user?.name || '' } });
    toast(`Đã lưu số tổng ${monthTitle(`${month}-01`).toLowerCase()}`);
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title={`Số tổng ${monthTitle(`${month}-01`).toLowerCase()}`}
      footer={<>
        {cur && <button className="icon-btn danger" aria-label="Xoá số tổng" onClick={() => { dispatch({ type: 'HISTORY', month, entry: null }); toast('Đã xoá số tổng'); onClose(); }}><Trash2 size={18} /></button>}
        <button className="btn primary block" disabled={!total} onClick={save}>Lưu số tổng · {fmtVND(total)}</button>
      </>}>
      <p className="fin-note">Dùng cho tháng chưa có dữ liệu đặt phòng trong app. Số tổng sẽ thay cho doanh thu tính từ đặt phòng của tháng này. Lương và chi phí khác thêm ở mục Khoản chi.</p>
      <div className="hist-head"><span>Sàn</span><span>Doanh thu</span><span>Phí sàn</span></div>
      {platforms.map((p) => (
        <div key={p} className="hist-row">
          <span className="hist-name"><span className="pdot" style={{ background: platformColor(p) }} />{p}</span>
          <MoneyInput value={rev[p] ?? null} onChange={(v) => setRev({ ...rev, [p]: v })} />
          <MoneyInput value={fees[p] ?? null} onChange={(v) => setFees({ ...fees, [p]: v })} placeholder={`${feePct(fin, p)}%`} />
        </div>
      ))}
      <Field label="Ghi chú"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: lấy từ sổ sách tháng 9" /></Field>
    </Sheet>
  );
}

/* ---------- Cài đặt tài chính: phí sàn, thuế ---------- */
export function FinanceSettings({ onClose, onOpenRates, focus }) {
  const { fin, dispatch } = useFinance();
  // mở từ Bảng giá ("Cập nhật tự động từ sàn"): cuộn tới mục Giá các sàn theo ngày (Apify)
  useEffect(() => {
    if (focus !== 'ota') return undefined;
    const t = setTimeout(() => {
      const el = document.getElementById('ota-rates');
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), 1600);
    }, 320);
    return () => clearTimeout(t);
  }, [focus]);
  const platforms = usePlatforms(Object.keys(DEFAULT_FEES).filter((p) => fin.settings.fees?.[p] != null && p !== 'Traveloka' && p !== 'Expedia'));
  return (
    <Sheet open onClose={onClose} title="Cài đặt tài chính">
      <h4 className="fin-h">Phí sàn (% trên giá phòng)</h4>
      <div className="fee-grid">
        {platforms.map((p) => (
          <label key={p} className="fee-item">
            <span><span className="pdot" style={{ background: platformColor(p) }} />{p}</span>
            <span className="pct-input">
              <input className="input sm" type="number" min="0" max="100" step="0.5" value={fin.settings.fees?.[p] ?? DEFAULT_FEES[p] ?? 0}
                onChange={(e) => dispatch({ type: 'SETTINGS', patch: { fees: { [p]: e.target.value === '' ? 0 : Number(e.target.value) } } })} />
              <em>%</em>
            </span>
          </label>
        ))}
      </div>
      <p className="tiny muted">Dùng khi đặt phòng chưa có phí sàn thực tế (nhập tay hoặc trong file báo cáo của sàn).</p>

      <h4 className="fin-h">Thuế</h4>
      <label className="fin-check">
        <input type="checkbox" checked={!!fin.settings.taxOn} onChange={(e) => dispatch({ type: 'SETTINGS', patch: { taxOn: e.target.checked } })} />
        <span><b>Tính thuế trên doanh thu</b><small>Hộ kinh doanh lưu trú thường 7% (5% GTGT + 2% TNCN). Tắt nếu được miễn.</small></span>
      </label>
      {fin.settings.taxOn && (
        <label className="fee-item solo">
          <span>Tỉ lệ thuế</span>
          <span className="pct-input"><input className="input sm" type="number" min="0" max="100" step="0.5" value={fin.settings.taxRate ?? 7} onChange={(e) => dispatch({ type: 'SETTINGS', patch: { taxRate: Number(e.target.value || 0) } })} /><em>%</em></span>
        </label>
      )}

      <h4 className="fin-h"><Pricing size={16} /> Bảng giá phòng</h4>
      <p className="tiny muted">Đặt giá một đêm cho từng phòng theo ngày. Đặt phòng từ sàn sẽ tự tính giá = tổng giá các đêm. Đặt phòng có giá trong file báo cáo hoặc nhập tay thì giữ nguyên.</p>
      <button className="btn ghost block" onClick={onOpenRates}><Pricing size={16} /> Mở bảng giá</button>

      <OtaRates />
    </Sheet>
  );
}

/* ---------- Giá các sàn theo ngày qua Apify (Hotel Rates API): Airbnb, Booking.com, Agoda ---------- */
const OTA = [
  { p: 'Airbnb', ph: 'airbnb.com/rooms/… hoặc airbnb.com/h/…', cost: 0.06, unit: 'phòng' },
  { p: 'Booking.com', ph: 'booking.com/hotel/vn/….html', cost: 0.018, unit: 'trang' },
  { p: 'Agoda', ph: 'Link có …-h123456.html / hotelId= hoặc mã cơ sở', cost: 0.018, unit: 'đêm' },
];
const MANUAL_PER_MONTH = 2;
const vnMonth = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 7);
const usd = (v) => `$${v < 0.1 ? v.toFixed(3) : v.toFixed(2)}`.replace('.', ',');

function OtaRates() {
  const { state } = useStore();
  const { fin, dispatch, runOta, status } = useFinance();
  const { role } = useSession();
  const [busy, setBusy] = useState(false);
  const rooms = state.locations.flatMap((l) => l.rooms.map((r) => ({ ...r, loc: state.locations.length > 1 ? l.name : '', locId: l.id })));
  const L = fin.otaListings || {};
  const [added, setAdded] = useState(() => new Set()); // ô sàn vừa bấm "+ Sàn" (chưa dán link)
  const run = fin.otaRun;
  const src = (p) => run?.sources?.[p] || (p === 'Airbnb' && run?.rooms ? { rooms: run.rooms, ok: run.ok } : null);
  // ô link hiện cho sàn mà phòng có lịch iCal, đã có link, hoặc vừa bấm "+ Sàn"
  const platsOf = (r) => OTA.filter((o) => L[r.id]?.[o.p] || added.has(`${r.id}|${o.p}`) || state.calendars.some((c) => c.roomId === r.id && c.platform === o.p));
  const shown = rooms;
  const addPlat = (roomId, p) => {
    setAdded(new Set([...added, `${roomId}|${p}`]));
    setTimeout(() => document.getElementById(`ota-${roomId}-${p}`)?.focus(), 60);
  };
  const today = todayKey();
  const set = (roomId, platform, value) => dispatch({ type: 'OTA_LISTING', roomId, platform, value });
  // ước tính chi phí mỗi lần chạy: Airbnb theo phòng, Booking theo trang (link chung tính 1), Agoda theo đêm còn trống ~ tới hết tháng sau
  const uniq = (p) => new Set(Object.values(L).map((v) => v?.[p]?.trim()).filter(Boolean)).size;
  const vn = new Date(Date.now() + 7 * 3600e3);
  const nightsLeft = Math.round((Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth() + 2, 1) - Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate())) / 864e5);
  const est = { Airbnb: 0.06 * uniq('Airbnb'), 'Booking.com': 0.018 * uniq('Booking.com'), Agoda: 0.018 * nightsLeft * uniq('Agoda') };
  const total = Object.values(est).reduce((a, b) => a + b, 0);
  const n = OTA.reduce((a, o) => a + uniq(o.p), 0);
  // lượt bấm tay còn lại trong tháng (chủ hệ thống không giới hạn)
  const m = fin.otaManual?.month === vnMonth() ? fin.otaManual.runs?.length || 0 : 0;
  const owner = role === 'owner';
  const left = owner ? Infinity : Math.max(0, MANUAL_PER_MONTH - m);
  const [ny, nm] = (() => { const d = new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth() + 1, 1)); return [d.getUTCFullYear(), String(d.getUTCMonth() + 1).padStart(2, '0')]; })();
  const go = async () => {
    setBusy(true);
    const r = await runOta();
    setBusy(false);
    if (!r.ok) { toast(r.error || 'Không lấy được giá'); return; }
    const parts = Object.entries(r.run?.sources || {}).map(([p, x]) => `${p} ${x.ok ? `${Object.values(x.rooms || {}).reduce((a, y) => Math.max(a, y.priced || 0), 0)} đêm` : 'lỗi'}`);
    toast(`Đã cập nhật giá các sàn${parts.length ? ` · ${parts.join(' · ')}` : ''}`);
  };
  // chép link sang các phòng khác cùng địa điểm (1 trang Booking / Agoda chung cho cả chi nhánh)
  const sameLoc = (r, p, link) => rooms.filter((x) => x.id !== r.id && x.locId === r.locId && L[x.id]?.[p] !== link);
  const copyAll = (r, p, link) => {
    const targets = sameLoc(r, p, link);
    targets.forEach((x) => set(x.id, p, link));
    toast(targets.length ? `Đã dùng link ${p} cho ${targets.length} phòng` : 'Các phòng đã có link này');
  };
  const agodaTypes = (link) => {
    const id = String(link || '').match(/^\d+$/) ? link : (String(link || '').match(/[?&](?:hotel_?id|hid)=(\d+)/i) || String(link || '').match(/-h(\d+)/i) || [])[1];
    return (id && src('Agoda')?.roomTypes?.[id]) || [];
  };
  const fx = src('Agoda')?.fx;
  return (
    <>
      <h4 className="fin-h ota-head" id="ota-rates"><Link2 size={16} /> Giá các sàn theo ngày (Apify)</h4>
      <p className="tiny muted">
        Dán link phòng trên <b>Airbnb, Booking.com, Agoda</b>. Máy chủ lấy giá từng đêm còn trống (tháng này và tháng sau) bằng actor Hotel Rates API của Apify,
        tự chạy <b>ngày 1 hằng tháng</b>. Đặt phòng của sàn nào tính theo giá sàn đó; đêm không có giá thì dùng Bảng giá.
        Booking.com: giá thấp nhất của trang (chưa gồm thuế/phí) – nhiều phòng dùng chung 1 trang thì nhận chung giá. Agoda: giá đã gồm thuế, chọn được loại phòng.
      </p>
      <div className="listing-list">
        {shown.length === 0 && <p className="tiny muted">Chưa có phòng nào.</p>}
        {shown.map((r) => (
          <div key={r.id} className="listing-item">
            <div className="listing-top"><b>{r.name}</b><small>{r.loc}</small></div>
            {platsOf(r).map((o) => {
              const link = L[r.id]?.[o.p] || '';
              const rr = src(o.p)?.rooms?.[r.id];
              const future = Object.keys(fin.otaRates?.[r.id]?.[o.p] || {}).filter((d) => d >= today).length;
              const others = o.p !== 'Airbnb' && link && sameLoc(r, o.p, link).length > 0;
              const types = o.p === 'Agoda' ? agodaTypes(link) : [];
              return (
                <div key={o.p} className="listing-row">
                  <label className="listing-plat"><span className="pdot" style={{ background: platformColor(o.p) }} />{o.p}</label>
                  <input id={`ota-${r.id}-${o.p}`} className="input sm" inputMode="url" placeholder={o.ph} value={link} onChange={(e) => { const k = `${r.id}|${o.p}`; if (!added.has(k)) setAdded(new Set([...added, k])); set(r.id, o.p, e.target.value.trim()); }} />
                  {o.p === 'Agoda' && link && (
                    <select className="input sm" value={L[r.id]?.AgodaRoom || ''} onChange={(e) => set(r.id, 'AgodaRoom', e.target.value)} aria-label="Loại phòng trên Agoda">
                      <option value="">Loại phòng: giá thấp nhất của cơ sở</option>
                      {[...new Set([...(L[r.id]?.AgodaRoom ? [L[r.id].AgodaRoom] : []), ...types])].map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  )}
                  {o.p === 'Agoda' && link && !types.length && <small className="muted">Danh sách loại phòng hiện sau lần lấy giá đầu tiên.</small>}
                  {link && (rr || future > 0) && (
                    <small className={`listing-st ${rr && !rr.ok ? 'bad' : 'ok'}`}>
                      {rr && !rr.ok ? <AlertCircle size={13} /> : <CheckCircle2 size={13} />}
                      {rr && !rr.ok ? rr.error : `Có giá ${future} đêm sắp tới${rr ? ` · lần chạy gần nhất ${rr.priced} đêm` : ''}`}
                    </small>
                  )}
                  {others && <button className="link tiny" onClick={() => copyAll(r, o.p, link)}>Dùng link này cho các phòng khác{r.loc ? ` ở ${r.loc}` : ''} ({sameLoc(r, o.p, link).length})</button>}
                </div>
              );
            })}
            {OTA.some((o) => !platsOf(r).includes(o)) && (
              <div className="listing-add">
                {OTA.filter((o) => !platsOf(r).includes(o)).map((o) => (
                  <button key={o.p} type="button" className="mini-chip" style={{ '--pc': platformColor(o.p) }} onClick={() => addPlat(r.id, o.p)}>
                    <Plus size={13} /> {o.p}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      {uniq('Agoda') > 0 && (
        <div className="fx-row">
          <label className="fee-item solo">
            <span>Tỷ giá USD dự phòng</span>
            <span className="pct-input fx-input"><input className="input sm" type="number" min="1000" step="100" placeholder="26000" value={fin.settings.usdVnd || ''} onChange={(e) => dispatch({ type: 'SETTINGS', patch: { usdVnd: Number(e.target.value) || undefined } })} /><em>₫</em></span>
          </label>
          <small className="tiny muted">Agoda báo giá USD, máy chủ tự lấy tỷ giá để đổi sang VND{fx ? ` (lần trước: 1 USD = ${fmtVND(fx.rate)}${fx.auto ? ', tự động' : ''})` : ''}. Số này chỉ dùng khi không lấy được tỷ giá.</small>
        </div>
      )}
      {run && (
        <p className={`tiny ${run.ok ? 'muted' : 'form-error'}`}>
          Cập nhật lần cuối {timeAgo(run.at)} ({dm(new Date(run.at + 7 * 3600e3).toISOString().slice(0, 10))}) · {run.by}{run.ok ? '' : ` · ${run.error}`}
          {run.sources && Object.entries(run.sources).some(([, x]) => !x.ok) && run.ok && ` · lỗi: ${Object.entries(run.sources).filter(([, x]) => !x.ok).map(([p, x]) => `${p} (${x.error})`).join(', ')}`}
        </p>
      )}
      {n > 0 && <p className="tiny muted ota-cost">Ước tính mỗi lần chạy: <b>{usd(total)}</b>{OTA.filter((o) => est[o.p]).map((o) => ` · ${o.p} ${usd(est[o.p])}`).join('')}{est.Agoda ? ` (Agoda ${nightsLeft} đêm, bỏ đêm đã kín phòng)` : ''}</p>}
      <button className="btn ghost block" onClick={go} disabled={busy || !n || left <= 0 || !status.enabled}>
        <RefreshCw size={16} className={busy ? 'spin' : ''} /> {busy ? 'Đang lấy giá các sàn… (khoảng 1–2 phút)' : 'Cập nhật giá các sàn ngay'}
      </button>
      {status.enabled && !owner && (
        <p className={`tiny ${left ? 'muted' : 'form-error'} ota-left`}>
          {left ? `Còn ${left}/${MANUAL_PER_MONTH} lần cập nhật tay trong tháng này` : `Đã dùng ${MANUAL_PER_MONTH}/${MANUAL_PER_MONTH} lần cập nhật tay tháng này`} · Lần tự cập nhật tiếp theo: 01/{nm}/{ny}
        </p>
      )}
      {!status.enabled && <p className="tiny muted">Chế độ xem thử dùng giá mẫu, không chạy Apify. Mỗi cơ sở được cập nhật tay {MANUAL_PER_MONTH} lần / tháng.</p>}
    </>
  );
}
