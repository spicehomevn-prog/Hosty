import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Settings2, Upload, Plus, AlertTriangle, Revenue, Payments, Reports, Pencil, History, Users, Trash2, Pricing } from '../lib/icons.jsx';
import { useStore, platformColor } from '../lib/store.jsx';
import { useFinance } from '../lib/finance.jsx';
import { useSession } from '../lib/session.jsx';
import { getBookings, roomIndex } from '../lib/derive.js';
import { ledger, monthSummary, platformOrder, SOURCE_SHORT } from '../lib/fin.js';
import { fmtVND, fmtShort } from '../lib/money.js';
import { todayKey, addMonths, monthTitle, dm } from '../lib/dates.js';
import { PriceSheet, ExpenseSheet, HistorySheet, FinanceSettings } from './FinanceSheets.jsx';
import { ImportReport } from './ImportReport.jsx';
import { CancelSheet } from './BookingSheet.jsx';
import { RateCalendar } from './RateCalendar.jsx';

const REV = '#7C5CE6';
const COST = '#F0A132';
const shiftMonth = (m, n) => addMonths(`${m}-01`, n).slice(0, 7);
const mLabel = (m) => `T${Number(m.slice(5))}`;

export default function Finance({ api }) {
  const sess = useSession();
  const { state } = useStore();
  const finance = useFinance();
  const { fin, dispatch } = finance;
  const thisMonth = todayKey().slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const [sheet, setSheet] = useState(null); // {type, data}
  const [onlyMissing, setOnlyMissing] = useState(false);
  // "Xem & nhập giá": lọc đặt phòng chưa có giá rồi cuộn xuống danh sách
  const listRef = useRef(null);
  const [jump, setJump] = useState(0);
  const showMissing = () => { setOnlyMissing(true); setJump(Date.now()); };
  useEffect(() => {
    if (!jump) return undefined;
    const t = setTimeout(() => listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    return () => clearTimeout(t);
  }, [jump]);
  const idx = useMemo(() => roomIndex(state), [state]);
  const bookings = useMemo(() => getBookings(state), [state]);
  const { items, cancelled } = useMemo(() => ledger(state, bookings, fin), [state, bookings, fin]);
  const s = useMemo(() => monthSummary(items, fin, month), [items, fin, month]);
  const series = useMemo(() => Array.from({ length: 6 }, (_, i) => monthSummary(items, fin, shiftMonth(month, i - 5))), [items, fin, month]);
  const open = (type, data) => setSheet({ type, data });
  const platforms = platformOrder(Object.keys(s.revenue));
  const maxRev = Math.max(1, ...Object.values(s.revenue));
  const rows = onlyMissing ? s.rows.filter((r) => r.amount == null) : s.rows;
  const cancelledHere = cancelled.filter((b) => b.start.slice(0, 7) <= month && b.end.slice(0, 7) >= month);

  const openRow = (b) => {
    if (b.cancelFee) open('cancel', b);
    else if (b.source === 'manual' && !b.ledgerOnly) api.openBooking(b);
    else open('price', b);
  };

  return (
    <div className="finance">
      <header className="page-head rise">
        <div><h1>Tài chính</h1><p className="sub">Doanh thu & chi phí · chỉ admin và chủ hệ thống <SyncDot /></p></div>
        <div className="row gap8">
          <button className="icon-btn" onClick={() => open('rates')} aria-label="Bảng giá phòng"><Pricing size={18} /></button>
          <button className="icon-btn" onClick={() => open('import')} aria-label="Nhập file báo cáo từ sàn"><Upload size={18} /></button>
          <button className="icon-btn" onClick={() => open('settings')} aria-label="Cài đặt tài chính"><Settings2 size={18} /></button>
        </div>
      </header>

      <div className="month-nav rise" style={{ '--i': 1 }}>
        <button className="icon-btn sm" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Tháng trước"><ChevronLeft size={18} /></button>
        <b>{monthTitle(`${month}-01`)}</b>
        <button className="icon-btn sm" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Tháng sau"><ChevronRight size={18} /></button>
      </div>

      <div className="fin-hero rise" style={{ '--i': 2 }}>
        <span className="fin-hero-label">Lợi nhuận {month === thisMonth ? 'tháng này' : mLabel(month).replace('T', 'tháng ')}</span>
        <b className={`fin-hero-num ${s.profit < 0 ? 'neg' : ''}`}>{fmtVND(s.profit)}</b>
        <span className="fin-hero-sub">Doanh thu − phí sàn − thuế − lương − chi phí khác</span>
        {s.fromHistory && <button className="fin-flag" onClick={() => open('history', month)}><History size={14} /> Số nhập tay · sửa</button>}
      </div>
      <div className="fin-stats rise" style={{ '--i': 3 }}>
        <div className="fin-stat"><span><Revenue size={15} /> Doanh thu</span><b>{fmtShort(s.revenueTotal)}</b></div>
        <div className="fin-stat"><span><Payments size={15} /> Chi phí</span><b>{fmtShort(s.cost)}</b></div>
        <div className="fin-stat"><span><Reports size={15} /> Giá TB/đêm</span><b>{s.adr ? fmtShort(s.adr) : '—'}</b></div>
      </div>

      {s.missing > 0 && !s.fromHistory && (
        <div className="alert warn miss-banner">
          <AlertTriangle size={18} />
          <span>{s.missing} đặt phòng chưa có giá, doanh thu đang thiếu phần này</span>
          <div className="miss-actions">
            <button className="btn tiny" onClick={showMissing}>Xem & nhập giá</button>
            <button className="btn tiny" onClick={() => open('rates')}><Pricing size={14} /> Đặt bảng giá</button>
          </div>
        </div>
      )}

      <div className="section-row">
        <h2 className="section-title">6 tháng gần đây</h2>
        <div className="chart-legend"><span><i style={{ background: REV }} />Doanh thu</span><span><i style={{ background: COST }} />Chi phí</span></div>
      </div>
      <MonthChart series={series} selected={month} onSelect={setMonth} />

      <h2 className="section-title">Doanh thu theo sàn</h2>
      <div className="fin-card">
        {platforms.length === 0 && <p className="tiny muted">Chưa có doanh thu trong tháng này.</p>}
        {platforms.map((p) => (
          <div key={p} className="prow">
            <div className="prow-top"><span><span className="pdot" style={{ background: platformColor(p) }} />{p}</span><b>{fmtVND(s.revenue[p])}</b></div>
            <div className="prow-track"><div style={{ width: `${(s.revenue[p] / maxRev) * 100}%`, background: platformColor(p) }} /></div>
          </div>
        ))}
        {platforms.length > 0 && <div className="fin-total"><span>Tổng doanh thu</span><b>{fmtVND(s.revenueTotal)}</b></div>}
        {s.servicesTotal > 0 && <div className="fin-discount"><span>Trong đó dịch vụ cộng thêm</span><span>{fmtVND(s.servicesTotal)}</span></div>}
        {s.discountTotal > 0 && <div className="fin-discount"><span>Đã giảm giá cho khách (đã trừ trong doanh thu)</span><span>{fmtVND(s.discountTotal)}</span></div>}
      </div>

      <h2 className="section-title">Chi phí</h2>
      <div className="fin-card cost-list">
        <div className="cost-row"><span>Phí sàn</span><b>{fmtVND(s.feeTotal)}</b></div>
        <div className="cost-row"><span>Thuế {fin.settings.taxOn ? `(${fin.settings.taxRate}% doanh thu)` : '(đang tắt)'}</span><b>{fmtVND(s.tax)}</b></div>
        <div className="cost-row"><span>Lương nhân viên</span><b>{fmtVND(s.salary)}</b></div>
        {Object.entries(s.otherByGroup).map(([g, v]) => <div key={g} className="cost-row sub"><span>{g}</span><b>{fmtVND(v)}</b></div>)}
        {!Object.keys(s.otherByGroup).length && <div className="cost-row"><span>Chi phí khác</span><b>{fmtVND(0)}</b></div>}
        <div className="fin-total"><span>Tổng chi phí</span><b>{fmtVND(s.cost)}</b></div>
      </div>

      {s.dueList.length > 0 && (
        <>
          <div className="section-row">
            <h2 className="section-title">Còn phải thu</h2>
            <b className="due-total">{fmtVND(s.dueList.reduce((a, x) => a + x.due, 0))}</b>
          </div>
          <div className="fin-list">
            {s.dueList.map(({ b, due, total, deposit }) => (
              <button key={b.id} className="fin-row due-row" onClick={() => api.openBooking(b)}>
                <span className="fin-bar" style={{ background: platformColor(b.platform) }} />
                <span className="arr-main">
                  <b>{idx[b.roomId]?.room.name || 'Phòng'}{b.summary ? ` · ${b.summary}` : ''}</b>
                  <small>{dm(b.start)} → {dm(b.end)} · tổng {fmtVND(total)}{deposit ? ` · đã cọc ${fmtShort(deposit)}` : ''}</small>
                </span>
                <span className="fin-amt"><b className="due-amt">{fmtVND(due)}</b><small>còn thu</small></span>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="section-row fin-list-head" ref={listRef}>
        <h2 className="section-title">{onlyMissing ? 'Đặt phòng chưa có giá' : 'Đặt phòng trong tháng'}</h2>
        {onlyMissing ? <button className="link" onClick={() => setOnlyMissing(false)}>Xem tất cả</button> : <span className="tiny muted">{s.rows.length} lượt · {s.nights} đêm</span>}
      </div>
      {s.fromHistory && <p className="tiny muted">Tháng này dùng số tổng nhập tay; danh sách dưới đây chỉ để tham khảo.</p>}
      <div className="fin-list">
        {rows.length === 0 && <div className="empty-card"><Revenue size={20} /><p>Không có đặt phòng nào{onlyMissing ? ' thiếu giá' : ''} trong tháng này.</p></div>}
        {rows.map(({ b, n, amount, fee }) => (
          <button key={b.id} className={`fin-row ${amount == null ? 'missing' : ''}`} onClick={() => openRow(b)}>
            <span className="fin-bar" style={{ background: platformColor(b.platform) }} />
            <span className="arr-main">
              <b>{idx[b.roomId]?.room.name || 'Không gắn phòng'}</b>
              {b.cancelFee
                ? <small><span className="fin-cancel">Đã huỷ {dm(b.cancelDate)}</span>{b.start !== b.end ? ` · ${dm(b.start)} → ${dm(b.end)}` : ''} · giữ lại cọc / phí huỷ</small>
                : <small>{b.platform} · {dm(b.start)} → {dm(b.end)}{n !== Math.round((new Date(b.end) - new Date(b.start)) / 864e5) ? ` · ${n} đêm trong tháng` : ''}</small>}
            </span>
            {amount == null
              ? <em className="ftag warn">Chưa có giá</em>
              : (
                <span className="fin-amt">
                  <b>{fmtVND(amount)}{b.price.discountTotal > 0 && <em className="disc-tag">giảm</em>}{b.price.due > 0 && <em className="disc-tag due">còn thu</em>}</b>
                  <small>{SOURCE_SHORT[b.price.source]}{b.price.estimated ? ' · ước tính' : ''}{fee ? ` · phí ${fmtShort(fee)}` : ''}</small>
                </span>
              )}
          </button>
        ))}
      </div>

      <div className="section-row">
        <h2 className="section-title">Khoản chi</h2>
        <button className="link" onClick={() => open('expense', {})}><Plus size={15} /> Thêm khoản chi</button>
      </div>
      <div className="fin-list">
        {s.expenses.length === 0 && <div className="empty-card"><Payments size={20} /><p>Chưa có khoản chi nào trong tháng này.</p></div>}
        {s.expenses.map((x) => (
          <button key={x.id} className="fin-row" onClick={() => open('expense', x)}>
            <span className={`exp-ico ${x.kind}`}>{x.kind === 'salary' ? <Users size={18} /> : <Payments size={18} />}</span>
            <span className="arr-main">
              <b>{x.kind === 'salary' ? x.staffName : x.title}</b>
              <small>{x.kind === 'salary' ? x.title : x.group} · {x.monthly ? `hằng tháng từ ${dm(x.date).slice(3)}/${x.date.slice(0, 4)}` : dm(x.date)}</small>
            </span>
            <span className="fin-amt"><b>{fmtVND(x.amount)}</b>{x.monthly && <small>lặp lại</small>}</span>
          </button>
        ))}
      </div>

      {cancelledHere.length > 0 && (
        <>
          <h2 className="section-title">Không còn trên lịch sàn</h2>
          <p className="tiny muted">Có giá trong sổ nhưng sàn đã bỏ khỏi lịch iCal (có thể khách đã huỷ). Không tính vào doanh thu.</p>
          <div className="fin-list">
            {cancelledHere.map((b) => (
              <div key={b.id} className="fin-row muted-row">
                <span className="fin-bar" style={{ background: platformColor(b.platform) }} />
                <span className="arr-main"><b>{idx[b.roomId]?.room.name || 'Phòng'}</b><small>{b.platform} · {dm(b.start)} → {dm(b.end)} · {fmtVND(b.price.amount)}</small></span>
                <button className="icon-btn sm danger" aria-label="Xoá khỏi sổ" onClick={() => dispatch({ type: 'PRICE', id: b.id, entry: null })}><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        </>
      )}

      <h2 className="section-title">Tháng trước khi dùng Hostexa</h2>
      <div className="xl-card">
        <span className="xl-ico"><History size={22} /></span>
        <div>
          <b>Bổ sung số liệu các tháng cũ</b>
          <small>Nhập tay số tổng doanh thu của tháng, hoặc tải file báo cáo xuất từ Airbnb, Booking.com, Agoda để lấy giá từng đặt phòng.</small>
          <div className="row gap8 wrap">
            <button className="btn primary" onClick={() => open('history', month)}><Pencil size={16} /> Số tổng {mLabel(month)}</button>
            <button className="btn ghost" onClick={() => open('import')}><Upload size={16} /> Tải file báo cáo</button>
          </div>
        </div>
      </div>

      {sheet?.type === 'cancel' && <CancelSheet b={sheet.data} finance={finance} onClose={() => setSheet(null)} />}
      {sheet?.type === 'price' && <PriceSheet b={sheet.data} onClose={() => setSheet(null)} />}
      {sheet?.type === 'expense' && <ExpenseSheet expense={sheet.data} month={month} onClose={() => setSheet(null)} />}
      {sheet?.type === 'history' && <HistorySheet month={sheet.data} onClose={() => setSheet(null)} />}
      {sheet?.type === 'settings' && <FinanceSettings onClose={() => setSheet(null)} onOpenRates={() => open('rates')} focus={sheet.data} />}
      {sheet?.type === 'rates' && <RateCalendar onClose={() => setSheet(null)} initialRoom={sheet.data} onOpenOta={sess.plan.has('ota') ? () => open('settings', 'ota') : null} />}
      {sheet?.type === 'import' && <ImportReport month={month} onClose={() => setSheet(null)} />}
    </div>
  );
}

/* Trạng thái lưu dữ liệu tài chính lên máy chủ */
function SyncDot() {
  const { status } = useFinance();
  if (!status.enabled) return null;
  const st = status.error ? ['bad', 'chưa lưu được'] : status.syncing || status.dirty ? ['busy', 'đang lưu…'] : ['ok', 'đã lưu'];
  return <span className={`fin-sync ${st[0]}`} title={status.error || ''}>· {st[1]}</span>;
}

/* Biểu đồ cột nhóm: doanh thu và chi phí 6 tháng (một trục, cột ≤ 24px, đầu cột bo 4px) */
function MonthChart({ series, selected, onSelect }) {
  const [hover, setHover] = useState(null);
  const W = 340; const H = 170; const L = 34; const B = 24; const T = 8;
  const max = Math.max(1, ...series.flatMap((s) => [s.revenueTotal, s.cost]));
  const step = niceStep(max / 3);
  const top = Math.ceil(max / step) * step;
  const y = (v) => T + (H - T - B) * (1 - v / top);
  const band = (W - L) / series.length;
  const bw = Math.min(16, band / 2 - 6);
  const bar = (x, v, color) => {
    const h = Math.max(0, y(0) - y(v));
    if (h <= 0) return null;
    const r = Math.min(4, h);
    return <path d={`M${x} ${y(0)} V${y(0) - h + r} q0 -${r} ${r} -${r} H${x + bw - r} q${r} 0 ${r} ${r} V${y(0)} Z`} fill={color} />;
  };
  const ticks = []; for (let v = 0; v <= top; v += step) ticks.push(v);
  const hs = hover != null ? series[hover] : null;
  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Doanh thu và chi phí 6 tháng gần đây">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W} y1={y(v)} y2={y(v)} className="grid" />
            <text x={L - 6} y={y(v) + 3.5} className="tick" textAnchor="end">{v ? fmtShort(v).replace('tr', 'tr') : '0'}</text>
          </g>
        ))}
        {series.map((s, i) => {
          const x0 = L + band * i + band / 2 - bw - 1;
          return (
            <g key={s.month} className={`col ${s.month === selected ? 'sel' : ''}`}>
              {s.month === selected && <rect x={L + band * i + 2} y={T - 4} width={band - 4} height={H - T - B + 8} rx="8" className="sel-bg" />}
              {bar(x0, s.revenueTotal, REV)}
              {bar(x0 + bw + 2, s.cost, COST)}
              <text x={L + band * i + band / 2} y={H - 7} className={`xl ${s.month === selected ? 'on' : ''}`} textAnchor="middle">{mLabel(s.month)}</text>
              <rect x={L + band * i} y={0} width={band} height={H} fill="transparent"
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => onSelect(s.month)} style={{ cursor: 'pointer' }} />
            </g>
          );
        })}
      </svg>
      {hs && (
        <div className="chart-tip" style={{ left: `${((L + band * hover + band / 2) / W) * 100}%` }}>
          <b>{monthTitle(`${hs.month}-01`)}</b>
          <span><i style={{ background: REV }} />Doanh thu <em>{fmtVND(hs.revenueTotal)}</em></span>
          <span><i style={{ background: COST }} />Chi phí <em>{fmtVND(hs.cost)}</em></span>
          <span className="tip-profit">Lợi nhuận <em>{fmtVND(hs.profit)}</em></span>
        </div>
      )}
    </div>
  );
}

function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}
