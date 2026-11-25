import { useEffect, useMemo, useState } from 'react';
import { Copy, RefreshCw, ChevronRight } from '../lib/icons.jsx';
import { useStore, platformColor } from '../lib/store.jsx';
import { useFinance } from '../lib/finance.jsx';
import { getBookings } from '../lib/derive.js';
import { FORM_PLATFORMS } from '../lib/directPrices.js';
import { repriceAfter, mergeDays, mergePlatformDays } from '../lib/fin.js';
import { todayKey, addDays, addMonths, endOfMonth, rangeKeys, fromKey, dm, timeAgo } from '../lib/dates.js';
import { Sheet, toast } from './ui.jsx';
import { RatesExcel, DIRECT } from './RateCalendar.jsx';

/** Nhóm thứ trong tuần: [mã, nhãn, các thứ (getDay: 0 = CN)] */
const GROUPS = [['wk', 'T2–T5', [1, 2, 3, 4]], ['fri', 'T6', [5]], ['sat', 'T7', [6]], ['sun', 'CN', [0]]];
const dig = (v) => String(v ?? '').replace(/\D/g, '');
const show = (n) => (n ? Number(n).toLocaleString('vi-VN') : '');

/**
 * Bảng điền nhanh theo mẫu tuần: mỗi sàn 1 dòng × 4 ô (T2–T5, T6, T7, CN) -> áp cho khoảng ngày đã chọn.
 * Ô trống = giữ nguyên giá đang có. Giá lẻ / ngày lễ sửa ở lịch chọn ngày (onDays).
 */
export function WeekRates({ onClose, initialRoom, onOpenOta, onDays }) {
  const { state } = useStore();
  const { fin, dispatch } = useFinance();
  const today = todayKey();
  const firstRoom = state.locations[0]?.rooms[0]?.id || '';
  const [roomId, setRoomId] = useState(initialRoom || firstRoom);
  const [extra, setExtra] = useState([]);
  const [preset, setPreset] = useState('this'); // this | next | custom
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(endOfMonth(today));
  const [vals, setVals] = useState({});
  const bookings = useMemo(() => getBookings(state), [state]);

  const nextFirst = `${addMonths(`${today.slice(0, 7)}-01`, 1).slice(0, 7)}-01`;
  const [a, z] = preset === 'this' ? [today, endOfMonth(today)] : preset === 'next' ? [nextFirst, endOfMonth(nextFirst)] : [from, to];
  const days = useMemo(() => (a && z && a <= z ? rangeKeys(a, z).slice(0, 400) : []), [a, z]);
  const daysOf = (g) => days.filter((d) => GROUPS.find((x) => x[0] === g)[2].includes(fromKey(d).getDay()));
  const priceOn = (plat, d) => Number(plat === DIRECT ? fin.directRates?.[roomId]?.[d] : fin.platformRates?.[roomId]?.[plat]?.[d]) || 0;

  // điền sẵn giá đang có (lấy theo ngày đầu tiên của từng nhóm thứ trong khoảng); đổi phòng / khoảng ngày thì tính lại
  useEffect(() => {
    const v = {};
    for (const plat of FORM_PLATFORMS) {
      v[plat] = {};
      for (const [g, , wds] of GROUPS) {
        const d = days.find((x) => wds.includes(fromKey(x).getDay()) && priceOn(plat, x));
        v[plat][g] = d ? priceOn(plat, d) : null;
      }
    }
    setVals(v);
  }, [roomId, a, z]); // eslint-disable-line react-hooks/exhaustive-deps

  const setCell = (plat, g, text) => setVals((s) => ({ ...s, [plat]: { ...s[plat], [g]: Number(dig(text)) || null } }));
  const copyRow = (plat) => {
    setVals((s) => Object.fromEntries(FORM_PLATFORMS.map((p) => [p, { ...s[plat] }])));
    toast(`Đã chép giá dòng ${plat} cho mọi sàn`);
  };

  // các ô sẽ ghi: chỉ ô có nhập và khác giá đang có
  const plan = useMemo(() => {
    const rooms = [roomId, ...extra.filter((r) => r !== roomId)];
    const platPatch = {}; const dirPatch = {}; let cells = 0; const touched = new Set();
    for (const rid of rooms) {
      for (const plat of FORM_PLATFORMS) {
        for (const [g] of GROUPS) {
          const v = vals[plat]?.[g];
          if (!v) continue;
          for (const d of daysOf(g)) {
            const old = Number(plat === DIRECT ? fin.directRates?.[rid]?.[d] : fin.platformRates?.[rid]?.[plat]?.[d]) || 0;
            if (old === v) continue;
            if (plat === DIRECT) (dirPatch[rid] ||= {})[d] = v; else ((platPatch[rid] ||= {})[plat] ||= {})[d] = v;
            cells += 1; touched.add(d);
          }
        }
      }
    }
    return { rooms, platPatch, dirPatch, cells, touched: [...touched] };
  }, [vals, extra, roomId, days, fin.platformRates, fin.directRates]); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = () => {
    if (!plan.cells) return;
    const next = { ...fin, platformRates: mergePlatformDays(fin.platformRates, plan.platPatch), directRates: mergeDays(fin.directRates, plan.dirPatch) };
    const re = repriceAfter(bookings, next, plan.rooms, plan.touched);
    dispatch({ type: 'MERGE_RATES', general: {}, platform: plan.platPatch, direct: plan.dirPatch, reprice: re });
    const n = Object.values(re).filter(Boolean).length;
    toast(`Đã áp ${plan.cells} ô giá cho ${plan.rooms.length} phòng${n ? ` · cập nhật ${n} đặt phòng` : ''}`);
  };

  const roomName = state.locations.flatMap((l) => l.rooms).find((r) => r.id === roomId)?.name || '';
  const bad = preset === 'custom' && (!from || !to || from > to);
  return (
    <Sheet open onClose={onClose} title="Bảng giá phòng"
      footer={(
        <div className="rate-foot">
          <div className="rate-foot-top">
            <b>{plan.cells ? `${plan.cells} ô giá sẽ thay đổi` : 'Điền giá vào bảng để áp dụng'}</b>
            {days.length > 0 && <span className="tiny muted">{dm(days[0])} → {dm(days[days.length - 1])} · {plan.rooms.length} phòng</span>}
          </div>
          <button className="btn primary block" disabled={!plan.cells || bad} onClick={apply}>Áp giá</button>
        </div>
      )}>
      <div className="rate-rooms">
        {state.locations.map((loc) => (
          <div key={loc.id} className="rate-loc">
            {state.locations.length > 1 && <small>{loc.name}</small>}
            <div className="chip-row">
              {loc.rooms.map((r) => (
                <button key={r.id} type="button" className={`mini-chip ${roomId === r.id ? 'on' : ''}`} style={{ '--pc': '#6B4FD8' }}
                  onClick={() => { setRoomId(r.id); setExtra(extra.filter((x) => x !== r.id)); }}>{r.name}</button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="wk-range">
        <small>Áp cho các ngày</small>
        <div className="seg wide">
          <button type="button" className={preset === 'this' ? 'on' : ''} onClick={() => setPreset('this')}>Từ hôm nay</button>
          <button type="button" className={preset === 'next' ? 'on' : ''} onClick={() => setPreset('next')}>Tháng sau</button>
          <button type="button" className={preset === 'custom' ? 'on' : ''} onClick={() => setPreset('custom')}>Tự chọn</button>
        </div>
        {preset === 'custom' && (
          <div className="grid2">
            <label className="wk-date"><span>Từ ngày</span><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="wk-date"><span>Đến ngày</span><input type="date" className="input" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
          </div>
        )}
      </div>

      <div className="wk-table" role="table" aria-label={`Giá ${roomName} theo thứ trong tuần`}>
        <div className="wk-row wk-head" role="row">
          <span>Sàn</span>{GROUPS.map(([g, label]) => <span key={g} className={g === 'fri' || g === 'sat' ? 'we' : ''}>{label}</span>)}
        </div>
        {FORM_PLATFORMS.map((plat) => (
          <div key={plat} className="wk-row" role="row">
            <span className="wk-plat"><i style={{ background: platformColor(plat) }} />{plat === 'Booking.com' ? 'Booking' : plat}
              <button type="button" className="wk-copy" onClick={() => copyRow(plat)} aria-label={`Chép giá dòng ${plat} cho mọi sàn`}><Copy size={12} /></button>
            </span>
            {GROUPS.map(([g, label]) => (
              <input key={g} className="wk-cell" inputMode="numeric" placeholder="—" aria-label={`${plat} ${label}`}
                value={show(vals[plat]?.[g])} onChange={(e) => setCell(plat, g, e.target.value)} />
            ))}
          </div>
        ))}
      </div>
      <p className="tiny muted wk-note">Điền giá 1 đêm (đêm nhận phòng). Ô trống giữ nguyên giá đang có. Nút <Copy size={11} /> chép dòng đó cho mọi sàn. Đặt giá riêng từng ngày hoặc ngày lễ: bấm nút bên dưới.</p>

      <details className="rate-more">
        <summary>Áp cùng giá cho phòng khác{extra.length ? ` (${extra.length})` : ''}</summary>
        <div className="chip-row">
          {state.locations.flatMap((l) => l.rooms).filter((r) => r.id !== roomId).map((r) => (
            <button key={r.id} type="button" className={`mini-chip ${extra.includes(r.id) ? 'on' : ''}`} style={{ '--pc': '#6B4FD8' }}
              onClick={() => setExtra(extra.includes(r.id) ? extra.filter((x) => x !== r.id) : [...extra, r.id])}>{r.name}</button>
          ))}
        </div>
      </details>

      <button type="button" className="rate-auto" onClick={onDays}>
        <span className="rate-auto-ico days"><RefreshCw size={17} /></span>
        <span className="rate-auto-txt"><b>Sửa giá từng ngày, ngày lễ</b><small>Chọn ngày trên lịch, giảm giá theo ngày và theo số đêm</small></span>
        <ChevronRight size={18} />
      </button>
      {onOpenOta && (
        <button type="button" className="rate-auto" onClick={onOpenOta}>
          <span className="rate-auto-ico"><RefreshCw size={17} /></span>
          <span className="rate-auto-txt">
            <b>Cập nhật tự động từ sàn</b>
            <small>Airbnb, Booking.com, Agoda qua Apify{fin.otaRun?.at ? ` · lần gần nhất ${timeAgo(fin.otaRun.at)}` : ' · chưa cài đặt'}</small>
          </span>
          <ChevronRight size={18} />
        </button>
      )}
      <details className="rate-more">
        <summary>Điền bằng file Excel (nhiều phòng cùng lúc)</summary>
        <RatesExcel month={(days[0] || today).slice(0, 7)} />
      </details>
    </Sheet>
  );
}
