import { useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '../lib/session.jsx';
import { readRows } from '../lib/report.js';
import { downloadRateTemplate, parseRateSheet } from '../lib/directPrices.js';
import { ChevronLeft, ChevronRight, Trash2, Download, Upload } from '../lib/icons.jsx';
import { useStore, platformColor } from '../lib/store.jsx';
import { useFinance } from '../lib/finance.jsx';
import { getBookings } from '../lib/derive.js';
import { repriceAfter, setDays, setPlatformDays, mergeDays, mergePlatformDays, stayRule, WEEK_NIGHTS, MONTH_NIGHTS } from '../lib/fin.js';
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
  // Các sàn: '' = Mọi sàn (bảng giá chung) · tên sàn = giá riêng sàn đó (ưu tiên hơn giá chung)
  const [plat, setPlat] = useState('');
  // 'Trực tiếp' = bảng giá riêng kênh Trực tiếp (chỉ để điền sẵn giá đặt phòng trực tiếp, không tính giá các sàn)
  const direct = plat === DIRECT;
  const plats = platformsOf(state, roomId);
  const onPlat = !direct && plat && plats.includes(plat) ? plat : '';
  const bookings = useMemo(() => getBookings(state), [state]);
  const general = fin.rateTable?.[roomId] || {};
  const table = direct ? fin.directRates?.[roomId] || {} : onPlat ? fin.platformRates?.[roomId]?.[onPlat] || {} : general;
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
    if (direct) {
      // kênh Trực tiếp: chỉ ghi bảng giá riêng, không tính lại đặt phòng của các sàn
      dispatch({ type: 'SET_DIRECT_RATES', roomIds, days: list, price: p || null });
      toast(`${p ? `Đã áp ${fmtVND(p)}/đêm` : 'Đã xoá giá'} (Trực tiếp) cho ${list.length} ngày${roomIds.length > 1 ? ` · ${roomIds.length} phòng` : ''}`);
      setSel(new Set());
      return;
    }
    if (onPlat) {
      const next = { ...fin, platformRates: setPlatformDays(fin.platformRates, roomIds, onPlat, list, p || null) };
      const re = reprice ? repriceAfter(bookings, next, roomIds, list) : {};
      dispatch({ type: 'SET_PLATFORM_RATES', roomIds, platform: onPlat, days: list, price: p || null, reprice: re });
      const n = Object.values(re).filter(Boolean).length;
      toast(`${p ? `Đã áp ${fmtVND(p)}/đêm` : 'Đã xoá giá'} (${onPlat}) cho ${list.length} ngày${roomIds.length > 1 ? ` · ${roomIds.length} phòng` : ''}${n ? ` · cập nhật ${n} đặt phòng` : ''}`);
      setSel(new Set());
      return;
    }
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
            {!direct && !onPlat && (
              <div className="seg mode-seg">
                <button type="button" className={mode === 'price' ? 'on' : ''} onClick={() => setMode('price')}>Giá</button>
                <button type="button" className={mode === 'discount' ? 'on' : ''} onClick={() => setMode('discount')}>Giảm</button>
              </div>
            )}
            {mode === 'price' || direct || onPlat
              ? <MoneyInput value={price} onChange={setPrice} placeholder="Giá 1 đêm" />
              : (
                <div className="money-input">
                  <input className="input" type="number" inputMode="decimal" min="0" max="100" placeholder="Giảm %" value={pct} onChange={(e) => setPct(e.target.value)} />
                  <span className="money-unit">%</span>
                </div>
              )}
          </div>
          <div className="rate-foot-row">
            <button className="btn ghost danger-ghost" disabled={!sel.size} onClick={() => apply(null)}><Trash2 size={16} /> {mode === 'price' || direct || onPlat ? 'Xoá giá' : 'Bỏ giảm'}</button>
            {mode === 'price' || direct || onPlat
              ? <button className="btn primary grow" disabled={!sel.size || !price} onClick={() => apply(price)}>Áp giá</button>
              : <button className="btn primary grow" disabled={!sel.size || !pctNum} onClick={() => apply(pctNum)}>Áp giảm giá {pctNum ? `${pctNum}%` : ''}</button>}
          </div>
        </div>
      )}>
      <RatesExcel month={month} />
      <div className="rate-rooms">
        {state.locations.map((loc) => (
          <div key={loc.id} className="rate-loc">
            {state.locations.length > 1 && <small>{loc.name}</small>}
            <div className="chip-row">
              {loc.rooms.map((r) => (
                <button key={r.id} type="button" className={`mini-chip ${roomId === r.id ? 'on' : ''}`} style={{ '--pc': '#6B4FD8' }} onClick={() => { setRoomId(r.id); setExtra(extra.filter((x) => x !== r.id)); }}>
                  {r.name}{!(fin.directRates?.[r.id] || fin.rateTable?.[r.id] || fin.platformRates?.[r.id]) && <i className="nodot" title="Chưa có bảng giá" />}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {(
        <div className="rate-plats">
          <small>Giá cho sàn</small>
          <div className="chip-row">
            <button type="button" className={`mini-chip ${!onPlat ? 'on' : ''}`} style={{ '--pc': '#241A3B' }} onClick={() => { setPlat(''); setSel(new Set()); }}>Mọi sàn</button>
            {plats.map((p) => (
              <button key={p} type="button" className={`mini-chip ${onPlat === p ? 'on' : ''}`} style={{ '--pc': platformColor(p) }} onClick={() => { setPlat(p); setMode('price'); setSel(new Set()); }}>
                {p}{Object.keys(fin.platformRates?.[roomId]?.[p] || {}).length > 0 && <i className="pdot" style={{ background: platformColor(p) }} />}
              </button>
            ))}
            <button type="button" className={`mini-chip ${direct ? 'on' : ''}`} style={{ '--pc': platformColor(DIRECT) }} onClick={() => { setPlat(DIRECT); setMode('price'); setSel(new Set()); }}>
              {DIRECT}{Object.keys(fin.directRates?.[roomId] || {}).length > 0 && <i className="pdot" style={{ background: platformColor(DIRECT) }} />}
            </button>
          </div>
          <p className="tiny muted">{direct
            ? 'Giá kênh Trực tiếp: tự điền giá khi tạo đặt phòng trực tiếp. Không ảnh hưởng giá các sàn.'
            : onPlat ? `Giá riêng ${onPlat}: ưu tiên hơn giá chung. Ngày để trống dùng giá chung (số mờ).` : 'Giá chung cho mọi sàn (Airbnb, Booking.com…), dùng tính doanh thu khi chưa có giá thật. Chọn 1 sàn để đặt giá riêng.'}</p>
        </div>
      )}
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
          const inherit = onPlat && !p ? general[d] : 0;
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
              ) : inherit ? <span className="rate-p inherit" title="Giá chung (Mọi sàn)">{fmtShort(inherit)}</span> : <span className={`rate-p ${p ? '' : 'none'}`}>{p ? fmtShort(p) : '—'}</span>}
              {off && !p && <span className="rate-off">−{off}%</span>}
              {air && !off && !direct && (!onPlat || onPlat === 'Airbnb') && <span className="rate-air" title={`Giá Airbnb ${fmtVND(air)}`}>A {fmtShort(air)}</span>}
              {busy[d] && <span className="rate-busy" style={{ background: busy[d] }} />}
            </button>
          );
        })}
      </div>
      <p className="tiny muted rate-legend"><span className="rate-busy inline" /> Đêm đã có khách · giá hiển thị là giá 1 đêm (nhận phòng ngày đó){Object.keys(fin.otaRates?.[roomId]?.Airbnb || {}).length ? ' · A = giá Airbnb lấy qua Apify, đặt phòng Airbnb dùng giá này' : ''}</p>

      {!direct && <StayDiscount roomId={roomId} roomName={state.locations.flatMap((l) => l.rooms).find((r) => r.id === roomId)?.name} bookings={bookings} />}

      <details className="rate-more">
        <summary>Áp cùng giá / giảm giá cho phòng khác{extra.length ? ` (${extra.length})` : ''}</summary>
        <div className="chip-row">
          {state.locations.flatMap((l) => l.rooms).filter((r) => r.id !== roomId).map((r) => (
            <button key={r.id} type="button" className={`mini-chip ${extra.includes(r.id) ? 'on' : ''}`} style={{ '--pc': '#6B4FD8' }}
              onClick={() => setExtra(extra.includes(r.id) ? extra.filter((x) => x !== r.id) : [...extra, r.id])}>{r.name}</button>
          ))}
        </div>
      </details>
      {!direct && <label className="fin-check">
        <input type="checkbox" checked={reprice} onChange={(e) => setReprice(e.target.checked)} />
        <span><b>Cập nhật luôn các đặt phòng đã có trong những ngày này</b><small>Chỉ đặt phòng đang tính theo bảng giá. Giá nhập tay hoặc từ file báo cáo của sàn giữ nguyên.</small></span>
      </label>}
    </Sheet>
  );
}

const DIRECT = 'Trực tiếp';
/** Sàn có lịch iCal của phòng (không có thì lấy các sàn đang dùng trong cơ sở) */
function platformsOf(state, roomId) {
  const all = (state.calendars || []).filter((c) => c.platform && c.platform !== 'Trực tiếp');
  const mine = [...new Set(all.filter((c) => c.roomId === roomId).map((c) => c.platform))];
  return mine.length ? mine : [...new Set(all.map((c) => c.platform))];
}

/**
 * Form Excel bảng giá của tháng: tải mẫu -> điền -> tải lên.
 * Trực tiếp: mỗi phòng 1 dòng (directRates). Các sàn: mỗi phòng 1 dòng "Mọi sàn" (rateTable) + 1 dòng / sàn (platformRates).
 */
function RatesExcel({ month }) {
  const { state } = useStore();
  const { fin, dispatch } = useFinance();
  const { workspace } = useSession();
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const fileRef = useRef(null);
  useEffect(() => { setRes(null); setErr(''); }, [month]);
  const multi = state.locations.length > 1;
  const rows = state.locations.flatMap((l) => l.rooms.flatMap((r) => {
    const name = multi ? `${r.name} · ${l.name}` : r.name;
    return [{ key: r.id, roomId: r.id, name, plat: '', values: fin.rateTable?.[r.id] },
      ...platformsOf(state, r.id).map((p) => ({ key: `${r.id}:${p}`, roomId: r.id, name, plat: p, values: fin.platformRates?.[r.id]?.[p] })),
      { key: `${r.id}:${DIRECT}`, roomId: r.id, name, plat: DIRECT, values: fin.directRates?.[r.id] }];
  }));
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
  const [y, mo] = month.split('-');
  const download = async () => {
    setBusy(true); setErr('');
    try { const n = await downloadRateTemplate(rows, month, workspace?.name || state.property?.name || '', { ota: true }); toast(`Đã tải ${n}`); } catch (e) { setErr(e.message || 'Không tạo được file'); }
    setBusy(false);
  };
  const pick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setErr(''); setRes(null);
    try {
      const r = parseRateSheet(await readRows(f), month, rows.map((x) => x.key), (k, d) => byKey[k]?.values?.[d]);
      const rooms = new Set(Object.keys(r.table).map((k) => byKey[k].roomId));
      setRes({ ...r, rooms: rooms.size, file: f.name });
    } catch (ex) { setErr(ex.message || 'Không đọc được file'); }
  };
  const apply = () => {
    const gen = {}; const plat = {}; const dir = {}; const roomIds = new Set(); const days = new Set();
    for (const [k, t] of Object.entries(res.table)) {
      const row = byKey[k];
      if (row.plat === DIRECT) { dir[row.roomId] = t; continue; } // bảng giá Trực tiếp: không tính lại đặt phòng các sàn
      roomIds.add(row.roomId); Object.keys(t).forEach((d) => days.add(d));
      if (row.plat) ((plat[row.roomId] ||= {})[row.plat] = t); else gen[row.roomId] = t;
    }
    const next = { ...fin, rateTable: mergeDays(fin.rateTable, gen), platformRates: mergePlatformDays(fin.platformRates, plat) };
    const re = repriceAfter(getBookings(state), next, [...roomIds], [...days]);
    dispatch({ type: 'MERGE_RATES', general: gen, platform: plat, direct: dir, reprice: re });
    const n = Object.values(re).filter(Boolean).length;
    toast(`Đã cập nhật bảng giá: ${res.changed} ô${res.cleared ? ` · xoá ${res.cleared}` : ''}${n ? ` · tính lại ${n} đặt phòng` : ''}`);
    setRes(null);
  };
  return (
    <div className="dr-excel">
      <div className="row gap8 wrap">
        <button className="btn tiny" onClick={download} disabled={busy || !rows.length}><Download size={14} /> Tải form Excel tháng {Number(mo)}/{y}</button>
        <button className="btn tiny" onClick={() => fileRef.current?.click()}><Upload size={14} /> Tải file đã điền lên</button>
        <input ref={fileRef} type="file" accept=".xlsx,.csv" hidden onChange={pick} />
      </div>
      <small>Mỗi phòng: 1 dòng "Mọi sàn", 1 dòng cho từng sàn và 1 dòng "Trực tiếp"; mỗi ngày 1 cột. Ô trống = giữ nguyên, gõ 0 = xoá giá.</small>
      {err && <p className="form-error">{err}</p>}
      {res && (
        <div className="imp-plan">
          <p><b>{res.file}</b>: {res.changed} ô giá mới{res.cleared ? `, xoá ${res.cleared} ô` : ''} · {res.rooms} phòng</p>
          {res.unknown > 0 && <p className="bad">{res.unknown} dòng có mã phòng không khớp – bỏ qua</p>}
          {res.invalid > 0 && <p className="bad">{res.invalid} ô không phải số – bỏ qua</p>}
          <p className="muted">Đặt phòng từ sàn đang tính theo bảng giá sẽ được tính lại. Giá nhập tay / file báo cáo của sàn giữ nguyên.</p>
          <div className="row gap8">
            <button className="btn tiny primary" disabled={!res.changed && !res.cleared} onClick={apply}>Áp vào bảng giá</button>
            <button className="btn tiny" onClick={() => setRes(null)}>Huỷ</button>
          </div>
        </div>
      )}
    </div>
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
