import { useMemo, useState } from 'react';
import { Trash2, Pricing } from '../lib/icons.jsx';
import { useStore, uid, platformColor } from '../lib/store.jsx';
import { useFinance } from '../lib/finance.jsx';
import { roomIndex } from '../lib/derive.js';
import { useMembers } from '../lib/members.js';
import { rateEstimate, feePct, EXPENSE_GROUPS, platformOrder, DEFAULT_FEES, applyDiscount } from '../lib/fin.js';
import { fmtVND } from '../lib/money.js';
import { dm, diffDays, todayKey, monthTitle } from '../lib/dates.js';
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
          <div><span>Theo bảng giá ({nights} đêm)</span><b>{fmtVND(est.base)}</b></div>
          {est.dayOff > 0 && <div className="off"><span>Giảm giá theo ngày</span><b>−{fmtVND(est.dayOff)}</b></div>}
          {est.stayOff > 0 && <div className="off"><span>Giảm ở dài ngày ({est.stayPct}%)</span><b>−{fmtVND(est.stayOff)}</b></div>}
          <div className="tot"><span>Giá theo bảng giá</span><b>{fmtVND(est.amount)}</b></div>
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
export function FinanceSettings({ onClose, onOpenRates }) {
  const { fin, dispatch } = useFinance();
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
    </Sheet>
  );
}
