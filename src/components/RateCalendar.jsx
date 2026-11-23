import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Trash2 } from '../lib/icons.jsx';
import { useStore } from '../lib/store.jsx';
import { useFinance } from '../lib/finance.jsx';
import { getBookings } from '../lib/derive.js';
import { repriceAfter, setDays, stayRule, WEEK_NIGHTS, MONTH_NIGHTS } from '../lib/fin.js';
import { fmtShort, fmtVND } from '../lib/money.js';
import { todayKey, addDays, addMonths, startOfWeek, endOfMonth, rangeKeys, monthTitle, WD_SHORT, fromKey } from '../lib/dates.js';
import { Sheet, MoneyInput, toast } from './ui.jsx';

/** Bảng giá: chọn các ngày trên lịch rồi áp chung một giá một đêm cho phòng */
export function RateCalendar({ onClose, initialRoom }) {
  const { state } = useStore();
  const { fin, dispatch } = useFinance();
  const today = todayKey();
  const firstRoom = state.locations[0]?.rooms[0]?.id || '';
  const [roomId, setRoomId] = useState(initialRoom || firstRoom);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [sel, setSel] = useState(() => new Set());
  const [range, setRange] = useState(false);
  const [anchor, setAnchor] = useState(null);
  const [price, setPrice] = useState(null);
  const [extra, setExtra] = useState([]);
  const [reprice, setReprice] = useState(true);
  const [mode, setMode] = useState('price'); // 'price' | 'discount'
  const [pct, setPct] = useState('');
  const bookings = useMemo(() => getBookings(state), [state]);
  const table = fin.rateTable?.[roomId] || {};
  const disc = fin.dayDiscount?.[roomId] || {};

  const first = `${month}-01`;
  const last = endOfMonth(first);
  const days = rangeKeys(startOfWeek(first), addDays(startOfWeek(last), 6));
  const inMonth = rangeKeys(first, last);
  const busy = useMemo(() => {
    const m = {};
    for (const b of bookings) {
      if (b.blocked || b.roomId !== roomId) continue;
      for (let d = b.start; d < b.end; d = addDays(d, 1)) m[d] = b.color;
    }
    return m;
  }, [bookings, roomId]);

  const toggle = (d) => {
    const next = new Set(sel);
    if (range) {
      if (!anchor) { setAnchor(d); next.add(d); setSel(next); return; }
      const [a, z] = anchor < d ? [anchor, d] : [d, anchor];
      for (const k of rangeKeys(a, z)) next.add(k);
      setAnchor(null); setSel(next); return;
    }
    if (next.has(d)) next.delete(d); else next.add(d);
    setSel(next);
  };
  const quick = (fn) => setSel(new Set(inMonth.filter(fn)));
  const wd = (d) => fromKey(d).getDay();
  const priced = inMonth.filter((d) => table[d]).length;

  // p: giá (chế độ Giá) hoặc % giảm (chế độ Giảm giá); null -> xoá
  const apply = (p) => {
    if (!sel.size) return;
    const roomIds = [roomId, ...extra.filter((r) => r !== roomId)];
    const list = [...sel];
    const isDisc = mode === 'discount';
    const next = isDisc ? { ...fin, dayDiscount: setDays(fin.dayDiscount, roomIds, list, p) } : { ...fin, rateTable: setDays(fin.rateTable, roomIds, list, p) };
    const re = reprice ? repriceAfter(bookings, next, roomIds, list) : {};
    dispatch(isDisc ? { type: 'SET_DAY_DISCOUNT', roomIds, days: list, pct: p || null, reprice: re } : { type: 'SET_RATES', roomIds, days: list, price: p || null, reprice: re });
    const n = Object.values(re).filter(Boolean).length;
    const what = isDisc ? (p ? `Đã giảm ${p}%` : 'Đã bỏ giảm giá') : (p ? `Đã áp ${fmtVND(p)}/đêm` : 'Đã xoá giá');
    toast(`${what} cho ${list.length} ngày${roomIds.length > 1 ? ` · ${roomIds.length} phòng` : ''}${n ? ` · cập nhật ${n} đặt phòng` : ''}`);
    setSel(new Set());
  };
  const pctNum = Math.min(100, Math.max(0, Number(pct) || 0));

  return (
    <Sheet open onClose={onClose} title="Bảng giá phòng"
      footer={(
        <div className="rate-foot">
          <div className="rate-foot-top">
            <b>{sel.size ? `Đã chọn ${sel.size} ngày` : 'Chạm vào ngày để chọn'}</b>
            {sel.size > 0 && <button className="link" onClick={() => setSel(new Set())}>Bỏ chọn</button>}
          </div>
          <div className="rate-foot-row">
            <div className="seg mode-seg">
              <button type="button" className={mode === 'price' ? 'on' : ''} onClick={() => setMode('price')}>Giá</button>
              <button type="button" className={mode === 'discount' ? 'on' : ''} onClick={() => setMode('discount')}>Giảm</button>
            </div>
            {mode === 'price'
              ? <MoneyInput value={price} onChange={setPrice} placeholder="Giá 1 đêm" />
              : (
                <div className="money-input">
                  <input className="input" type="number" inputMode="decimal" min="0" max="100" placeholder="Giảm %" value={pct} onChange={(e) => setPct(e.target.value)} />
                  <span className="money-unit">%</span>
                </div>
              )}
          </div>
          <div className="rate-foot-row">
            <button className="btn ghost danger-ghost" disabled={!sel.size} onClick={() => apply(null)}><Trash2 size={16} /> {mode === 'price' ? 'Xoá giá' : 'Bỏ giảm'}</button>
            {mode === 'price'
              ? <button className="btn primary grow" disabled={!sel.size || !price} onClick={() => apply(price)}>Áp giá</button>
              : <button className="btn primary grow" disabled={!sel.size || !pctNum} onClick={() => apply(pctNum)}>Áp giảm giá {pctNum ? `${pctNum}%` : ''}</button>}
          </div>
        </div>
      )}>
      <div className="rate-rooms">
        {state.locations.map((loc) => (
          <div key={loc.id} className="rate-loc">
            {state.locations.length > 1 && <small>{loc.name}</small>}
            <div className="chip-row">
              {loc.rooms.map((r) => (
                <button key={r.id} type="button" className={`mini-chip ${roomId === r.id ? 'on' : ''}`} style={{ '--pc': '#6B4FD8' }} onClick={() => { setRoomId(r.id); setExtra(extra.filter((x) => x !== r.id)); }}>
                  {r.name}{!fin.rateTable?.[r.id] && <i className="nodot" title="Chưa có bảng giá" />}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="month-nav sm">
        <button className="icon-btn sm" onClick={() => setMonth(addMonths(first, -1).slice(0, 7))} aria-label="Tháng trước"><ChevronLeft size={18} /></button>
        <b>{monthTitle(first)} <small>· {priced}/{inMonth.length} ngày có giá</small></b>
        <button className="icon-btn sm" onClick={() => setMonth(addMonths(first, 1).slice(0, 7))} aria-label="Tháng sau"><ChevronRight size={18} /></button>
      </div>

      <div className="rate-quick">
        <button className={`mini-chip ${range ? 'on' : ''}`} style={{ '--pc': '#6B4FD8' }} onClick={() => { setRange(!range); setAnchor(null); }}>{range ? (anchor ? 'Chạm ngày cuối…' : 'Chọn khoảng: bật') : 'Chọn khoảng'}</button>
        <button className="mini-chip" onClick={() => quick(() => true)}>Cả tháng</button>
        <button className="mini-chip" onClick={() => quick((d) => wd(d) === 5 || wd(d) === 6)}>Đêm T6, T7</button>
        <button className="mini-chip" onClick={() => quick((d) => wd(d) !== 5 && wd(d) !== 6)}>Ngày thường</button>
        <button className="mini-chip" onClick={() => quick((d) => !table[d])}>Ngày chưa có giá</button>
      </div>

      <div className="rate-grid" role="grid" aria-label={`Bảng giá ${monthTitle(first)}`}>
        {WD_SHORT.map((w) => <span key={w} className="rate-wd">{w}</span>)}
        {days.map((d) => {
          const out = d.slice(0, 7) !== month;
          if (out) return <span key={d} className="rate-day out" />;
          const p = table[d];
          const off = disc[d];
          const air = fin.otaRates?.[roomId]?.Airbnb?.[d];
          return (
            <button key={d} type="button" role="gridcell" aria-selected={sel.has(d)}
              className={`rate-day ${sel.has(d) ? 'sel' : ''} ${d < today ? 'past' : ''} ${d === today ? 'today' : ''} ${anchor === d ? 'anchor' : ''}`}
              onClick={() => toggle(d)}>
              <span className="rate-num">{Number(d.slice(8))}</span>
              {off && p ? (
                <>
                  <span className="rate-p disc" title={`Giá gốc ${fmtVND(p)}`}>{fmtShort(Math.round(p * (1 - off / 100)))}</span>
                  <span className="rate-off">−{off}%</span>
                </>
              ) : <span className={`rate-p ${p ? '' : 'none'}`}>{p ? fmtShort(p) : '—'}</span>}
              {off && !p && <span className="rate-off">−{off}%</span>}
              {air && !off && <span className="rate-air" title={`Giá Airbnb ${fmtVND(air)}`}>A {fmtShort(air)}</span>}
              {busy[d] && <span className="rate-busy" style={{ background: busy[d] }} />}
            </button>
          );
        })}
      </div>
      <p className="tiny muted rate-legend"><span className="rate-busy inline" /> Đêm đã có khách · giá hiển thị là giá 1 đêm (nhận phòng ngày đó){Object.keys(fin.otaRates?.[roomId]?.Airbnb || {}).length ? ' · A = giá Airbnb lấy qua Apify, đặt phòng Airbnb dùng giá này' : ''}</p>

      <StayDiscount roomId={roomId} roomName={state.locations.flatMap((l) => l.rooms).find((r) => r.id === roomId)?.name} bookings={bookings} />

      <details className="rate-more">
        <summary>Áp cùng giá / giảm giá cho phòng khác{extra.length ? ` (${extra.length})` : ''}</summary>
        <div className="chip-row">
          {state.locations.flatMap((l) => l.rooms).filter((r) => r.id !== roomId).map((r) => (
            <button key={r.id} type="button" className={`mini-chip ${extra.includes(r.id) ? 'on' : ''}`} style={{ '--pc': '#6B4FD8' }}
              onClick={() => setExtra(extra.includes(r.id) ? extra.filter((x) => x !== r.id) : [...extra, r.id])}>{r.name}</button>
          ))}
        </div>
      </details>
      <label className="fin-check">
        <input type="checkbox" checked={reprice} onChange={(e) => setReprice(e.target.checked)} />
        <span><b>Cập nhật luôn các đặt phòng đã có trong những ngày này</b><small>Chỉ đặt phòng đang tính theo bảng giá. Giá nhập tay hoặc từ file báo cáo của sàn giữ nguyên.</small></span>
      </label>
    </Sheet>
  );
}

/** Giảm giá theo số đêm ở (kiểu Airbnb): từ 7 đêm, từ 28 đêm */
function StayDiscount({ roomId, roomName, bookings }) {
  const { state } = useStore();
  const { fin, dispatch } = useFinance();
  const own = fin.stayDiscount?.[roomId];
  const hasOwn = !!(own && (own.week || own.month));
  const cur = stayRule(fin, roomId) || {};
  const [forAll, setForAll] = useState(!hasOwn);
  const [week, setWeek] = useState(cur.week ?? '');
  const [month, setMonth] = useState(cur.month ?? '');
  const [lastRoom, setLastRoom] = useState(roomId);
  if (lastRoom !== roomId) { // đổi phòng -> nạp lại cài đặt của phòng đó
    const r = stayRule(fin, roomId) || {};
    setLastRoom(roomId); setWeek(r.week ?? ''); setMonth(r.month ?? '');
    setForAll(!(fin.stayDiscount?.[roomId]?.week || fin.stayDiscount?.[roomId]?.month));
  }
  const clamp = (v) => (v === '' ? 0 : Math.min(100, Math.max(0, Number(v) || 0)));
  const save = () => {
    const rule = { week: clamp(week), month: clamp(month) };
    const key = forAll ? '*' : roomId;
    const allRooms = state.locations.flatMap((l) => l.rooms.map((r) => r.id));
    const stayDiscount = { ...(fin.stayDiscount || {}) };
    if (rule.week || rule.month) stayDiscount[key] = rule; else delete stayDiscount[key];
    if (forAll) delete stayDiscount[roomId]; // phòng này theo cài chung
    const roomIds = forAll ? allRooms : [roomId];
    const re = repriceAfter(bookings, { ...fin, stayDiscount }, roomIds, [], { all: true });
    dispatch({ type: 'SET_STAY_DISCOUNT', key, rule, reprice: re });
    if (forAll && hasOwn) dispatch({ type: 'SET_STAY_DISCOUNT', key: roomId, rule: null });
    const n = Object.values(re).filter(Boolean).length;
    toast(`Đã lưu giảm giá theo số đêm${forAll ? ' cho mọi phòng' : ` cho ${roomName}`}${n ? ` · cập nhật ${n} đặt phòng` : ''}`);
  };
  const summary = cur.week || cur.month ? `Từ ${WEEK_NIGHTS} đêm −${cur.week || 0}% · từ ${MONTH_NIGHTS} đêm −${cur.month || 0}%${hasOwn ? ' (riêng phòng này)' : ''}` : 'Chưa cài';
  return (
    <details className="rate-more stay">
      <summary>Giảm giá theo số đêm ở <small>{summary}</small></summary>
      <div className="stay-grid">
        <label className="fee-item"><span>Từ {WEEK_NIGHTS} đêm</span><span className="pct-input"><input className="input sm" type="number" min="0" max="100" value={week} onChange={(e) => setWeek(e.target.value)} /><em>%</em></span></label>
        <label className="fee-item"><span>Từ {MONTH_NIGHTS} đêm</span><span className="pct-input"><input className="input sm" type="number" min="0" max="100" value={month} onChange={(e) => setMonth(e.target.value)} /><em>%</em></span></label>
      </div>
      <label className="fin-check compact">
        <input type="checkbox" checked={forAll} onChange={(e) => setForAll(e.target.checked)} />
        <span><b>Dùng cho mọi phòng</b><small>{forAll ? 'Bỏ chọn để cài riêng cho ' + (roomName || 'phòng này') : `Chỉ áp cho ${roomName || 'phòng này'}`}</small></span>
      </label>
      <button className="btn ghost block" onClick={save}>Lưu giảm giá theo số đêm</button>
      <p className="tiny muted">Áp trên tổng tiền phòng (sau giảm theo ngày). Đặt phòng từ {MONTH_NIGHTS} đêm dùng mức tháng, từ {WEEK_NIGHTS} đêm dùng mức tuần.</p>
    </details>
  );
}
