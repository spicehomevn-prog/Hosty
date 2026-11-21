import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Plus, Trash2, Link2, Clock, MapPin, Sparkles, CheckCircle2, AlertCircle, Loader2, CalendarPlus } from 'lucide-react';
import { useStore, uid, PLATFORMS, LOCATION_EMOJI, demoState, platformColor } from '../lib/store.jsx';
import { Stepper, Field } from './ui.jsx';
import { Logo, LogoMark } from './Logo.jsx';

const STEPS = ['welcome', 'name', 'count', 'locations', 'calendars', 'finish'];

const newLocation = (i) => ({ id: uid(), name: '', address: '', emoji: LOCATION_EMOJI[i % LOCATION_EMOJI.length], rooms: [{ id: uid(), name: 'Phòng 1' }] });

export default function Onboarding({ editing, onDone, onCancel }) {
  const { state, dispatch, sync } = useStore();
  const [step, setStep] = useState(editing ? 1 : 0);
  const [name, setName] = useState(state.property.name || '');
  const [locations, setLocations] = useState(() => (state.locations.length ? structuredClone(state.locations) : [newLocation(0)]));
  const [calendars, setCalendars] = useState(() => structuredClone(state.calendars.filter((c) => !c.demo || editing)));
  const [defIn, setDefIn] = useState('14:00');
  const [defOut, setDefOut] = useState('12:00');
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const key = STEPS[step];

  const setCount = (n) => {
    setLocations((ls) => {
      const next = ls.slice(0, n);
      while (next.length < n) next.push(newLocation(next.length));
      return next;
    });
  };
  const updLoc = (id, patch) => setLocations((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const setRoomCount = (loc, n) => {
    const rooms = loc.rooms.slice(0, n);
    while (rooms.length < n) rooms.push({ id: uid(), name: `Phòng ${rooms.length + 1}` });
    updLoc(loc.id, { rooms });
  };
  const updRoom = (loc, rid, nm) => updLoc(loc.id, { rooms: loc.rooms.map((r) => (r.id === rid ? { ...r, name: nm } : r)) });

  const addCal = (roomId) => setCalendars((cs) => [...cs, { id: uid(), roomId, platform: '', url: '', checkIn: defIn, checkOut: defOut }]);
  const updCal = (id, patch) => setCalendars((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const delCal = (id) => setCalendars((cs) => cs.filter((c) => c.id !== id));

  const allRoomIds = useMemo(() => new Set(locations.flatMap((l) => l.rooms.map((r) => r.id))), [locations]);

  function next() {
    setErr('');
    if (key === 'name' && !name.trim()) return setErr('Vui lòng nhập tên cơ sở lưu trú');
    if (key === 'locations') {
      const bad = locations.findIndex((l) => !l.name.trim());
      if (bad >= 0) return setErr(`Vui lòng nhập tên cho địa điểm ${bad + 1}`);
      // mỗi phòng có sẵn 1 dòng lịch trống để điền
      setCalendars((cs) => {
        const kept = cs.filter((c) => allRoomIds.has(c.roomId));
        const has = new Set(kept.map((c) => c.roomId));
        const add = [];
        for (const l of locations) for (const r of l.rooms) if (!has.has(r.id)) add.push({ id: uid(), roomId: r.id, platform: '', url: '', checkIn: defIn, checkOut: defOut });
        return [...kept, ...add];
      });
    }
    if (key === 'calendars') {
      const bad = calendars.find((c) => c.url.trim() && !/^(https?|webcal):\/\//i.test(c.url.trim()));
      if (bad) return setErr('Có link iCal chưa đúng định dạng (phải bắt đầu bằng https://)');
      return finish();
    }
    setStep((s) => s + 1);
  }

  async function finish() {
    const cleanLocs = locations.map((l, i) => ({
      ...l, name: l.name.trim() || `Địa điểm ${i + 1}`, address: l.address.trim(),
      rooms: l.rooms.map((r, j) => ({ ...r, name: r.name.trim() || `Phòng ${j + 1}` })),
    }));
    const cals = calendars
      .filter((c) => allRoomIds.has(c.roomId) && (c.url.trim() || c.demo))
      .map((c) => ({ ...c, platform: c.platform.trim() || 'Khác', url: c.url.trim() }));
    setStep(STEPS.indexOf('finish'));
    setBusy(true);
    dispatch({ type: 'SETUP', property: { name: name.trim() }, locations: cleanLocs, calendars: cals });
    const res = await sync(cals);
    setResults({ res, cals, locs: cleanLocs });
    setBusy(false);
  }

  const progress = key === 'finish' ? 1 : step / 5;

  if (key === 'welcome') {
    return (
      <div className="onb onb-welcome">
        <div className="welcome-logo"><Logo size={52} animated /></div>
        <div className="welcome-art" aria-hidden="true">
          <div className="wa-card violet" style={{ '--d': '.45s' }}><CalendarPlus size={26} /><span>Lịch đặt phòng</span></div>
          <div className="wa-card yellow" style={{ '--d': '.58s' }}><Sparkles size={26} /><span>Thẻ dọn phòng</span></div>
          <div className="wa-card pink" style={{ '--d': '.71s' }}><CheckCircle2 size={26} /><span>Task mỗi ngày</span></div>
        </div>
        <h1 className="rise" style={{ '--i': 9 }}>Quản lý phòng,<br />gọn trong một lịch.</h1>
        <p className="muted rise" style={{ '--i': 10 }}>Đồng bộ lịch từ Airbnb, Booking.com, Agoda… qua iCal, tự tạo thẻ dọn phòng mỗi ngày và theo dõi công việc của khách sạn / homestay.</p>
        <div className="onb-actions col rise" style={{ '--i': 11 }}>
          <button className="btn primary lg" onClick={() => setStep(1)}>Bắt đầu thiết lập <ArrowRight size={18} /></button>
          <button className="btn ghost" onClick={() => { dispatch({ type: 'REPLACE', state: demoState() }); onDone(); }}>Xem thử với dữ liệu mẫu</button>
        </div>
      </div>
    );
  }

  return (
    <div className="onb">
      <div className="onb-top rise" style={{ '--i': 0 }}>
        {key !== 'finish' && (
          <button className="icon-btn" onClick={() => (step <= 1 ? (onCancel ? onCancel() : setStep(0)) : setStep(step - 1))} aria-label="Quay lại"><ArrowLeft size={20} /></button>
        )}
        <div className="onb-progress"><div style={{ width: `${progress * 100}%` }} /></div>
        <span className="onb-count">{Math.min(step, 4)}/4</span>
        <LogoMark size={34} radius={27} />
      </div>

      {key === 'name' && (
        <section className="onb-step step-in">
          <span className="eyebrow">Câu hỏi 1</span>
          <h2>Cơ sở lưu trú của bạn tên là gì?</h2>
          <p className="muted">Tên thương hiệu khách sạn / homestay — sẽ hiển thị trên trang tổng quan và thẻ dọn phòng.</p>
          <input className="input xl" autoFocus placeholder="VD: Mây Homestay" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && next()} />
        </section>
      )}

      {key === 'count' && (
        <section className="onb-step step-in">
          <span className="eyebrow">Câu hỏi 2</span>
          <h2>Bạn có bao nhiêu địa điểm?</h2>
          <p className="muted">Mỗi địa điểm là một toà nhà / chi nhánh có địa chỉ riêng.</p>
          <div className="big-stepper"><Stepper value={locations.length} onChange={setCount} min={1} max={20} /></div>
          <div className="loc-preview">
            {locations.map((l, i) => <span key={l.id} className="loc-pill">{l.emoji} {l.name || `Địa điểm ${i + 1}`}</span>)}
          </div>
        </section>
      )}

      {key === 'locations' && (
        <section className="onb-step step-in">
          <span className="eyebrow">Câu hỏi 3</span>
          <h2>Địa chỉ & phòng của từng địa điểm</h2>
          <p className="muted">Nhập địa chỉ, số phòng và đặt tên cho từng phòng.</p>
          {locations.map((loc, i) => (
            <div key={loc.id} className={`setup-card tone-${['violet', 'yellow', 'pink', 'blue'][i % 4]}`}>
              <div className="setup-card-head">
                <span className="emoji-box">{loc.emoji}</span>
                <b>Địa điểm {i + 1}</b>
              </div>
              <Field label="Tên địa điểm">
                <input className="input" placeholder={`VD: ${name || 'Mây'} – Đà Lạt`} value={loc.name} onChange={(e) => updLoc(loc.id, { name: e.target.value })} />
              </Field>
              <Field label="Địa chỉ">
                <div className="input-ico"><MapPin size={16} /><input className="input" placeholder="Số nhà, đường, phường, thành phố" value={loc.address} onChange={(e) => updLoc(loc.id, { address: e.target.value })} /></div>
              </Field>
              <div className="row-between">
                <span className="field-label">Số phòng</span>
                <Stepper value={loc.rooms.length} onChange={(n) => setRoomCount(loc, n)} min={1} max={60} />
              </div>
              <div className="room-inputs">
                {loc.rooms.map((r, j) => (
                  <input key={r.id} className="input sm" value={r.name} placeholder={`Phòng ${j + 1}`} onChange={(e) => updRoom(loc, r.id, e.target.value)} aria-label={`Tên phòng ${j + 1}`} />
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {key === 'calendars' && (
        <section className="onb-step step-in">
          <span className="eyebrow">Câu hỏi 4</span>
          <h2>Đồng bộ lịch phòng</h2>
          <p className="muted">Với mỗi phòng, nhập tên sàn và link iCal (.ics) xuất từ sàn đó. Bấm <b>+</b> để thêm lịch của sàn khác cho cùng phòng. Phòng không có link có thể để trống.</p>
          <div className="default-times">
            <span><Clock size={16} /> Giờ mặc định</span>
            <label>Nhận <input type="time" className="input time" value={defIn} onChange={(e) => setDefIn(e.target.value)} /></label>
            <label>Trả <input type="time" className="input time" value={defOut} onChange={(e) => setDefOut(e.target.value)} /></label>
            <button className="btn tiny" onClick={() => setCalendars((cs) => cs.map((c) => ({ ...c, checkIn: defIn, checkOut: defOut })))}>Áp dụng tất cả</button>
          </div>
          {locations.map((loc) => (
            <div key={loc.id} className="cal-loc">
              <h4>{loc.emoji} {loc.name}</h4>
              {loc.rooms.map((room) => {
                const cals = calendars.filter((c) => c.roomId === room.id);
                return (
                  <div key={room.id} className="cal-room">
                    <div className="cal-room-head">
                      <b>{room.name}</b>
                      <button className="add-btn" onClick={() => addCal(room.id)} aria-label={`Thêm lịch cho ${room.name}`}><Plus size={16} /> Thêm lịch</button>
                    </div>
                    {cals.length === 0 && <p className="tiny muted">Chưa có lịch nào — có thể thêm đặt phòng thủ công sau.</p>}
                    {cals.map((c) => (
                      <div key={c.id} className="cal-row" style={{ '--pc': platformColor(c.platform || 'x') }}>
                        <div className="cal-row-top">
                          <input className="input sm platform-input" list="platform-list" placeholder="Tên sàn (Airbnb, Booking.com…)" value={c.platform} onChange={(e) => updCal(c.id, { platform: e.target.value })} />
                          <button className="icon-btn sm danger" onClick={() => delCal(c.id)} aria-label="Xoá lịch"><Trash2 size={16} /></button>
                        </div>
                        <div className="chip-row">
                          {PLATFORMS.filter((p) => p.name !== 'Trực tiếp').map((p) => (
                            <button key={p.name} className={`mini-chip ${c.platform === p.name ? 'on' : ''}`} style={{ '--pc': p.color }} onClick={() => updCal(c.id, { platform: p.name })}>{p.name}</button>
                          ))}
                        </div>
                        <div className="input-ico"><Link2 size={16} /><input className="input sm" inputMode="url" placeholder="https://…/calendar.ics" value={c.url} onChange={(e) => updCal(c.id, { url: e.target.value })} /></div>
                        <div className="time-pair">
                          <label>Giờ nhận phòng <input type="time" className="input time" value={c.checkIn} onChange={(e) => updCal(c.id, { checkIn: e.target.value })} /></label>
                          <label>Giờ trả phòng <input type="time" className="input time" value={c.checkOut} onChange={(e) => updCal(c.id, { checkOut: e.target.value })} /></label>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
          <datalist id="platform-list">{PLATFORMS.map((p) => <option key={p.name} value={p.name} />)}</datalist>
          <details className="help">
            <summary>Lấy link iCal ở đâu?</summary>
            <ul>
              <li><b>Airbnb:</b> Lịch → chọn chỗ ở → Tình trạng còn phòng → Kết nối lịch → Xuất lịch.</li>
              <li><b>Booking.com:</b> Extranet → Giá & Tình trạng phòng → Đồng bộ lịch → Xuất lịch.</li>
              <li><b>Agoda:</b> YCS → Lịch → Đồng bộ lịch iCal → Xuất.</li>
            </ul>
          </details>
        </section>
      )}

      {key === 'finish' && (
        <section className="onb-step center step-in">
          {busy || !results ? (
            <>
              <div className="sync-orb"><Loader2 className="spin" size={34} /></div>
              <h2>Đang tạo lịch…</h2>
              <p className="muted">Đang tải dữ liệu từ các link iCal bạn cung cấp.</p>
            </>
          ) : (
            <>
              <div className="sync-orb done"><CheckCircle2 size={34} /></div>
              <h2>Đã tạo lịch cho {name}</h2>
              <p className="muted">{results.locs.length} địa điểm · {results.locs.reduce((s, l) => s + l.rooms.length, 0)} phòng · {results.cals.length} lịch đồng bộ</p>
              <div className="sync-results">
                {results.cals.length === 0 && <p className="tiny muted">Chưa có link iCal nào. Bạn có thể thêm sau ở mục Cơ sở, hoặc nhập đặt phòng thủ công.</p>}
                {results.cals.map((c) => {
                  const r = results.res.find((x) => x.id === c.id);
                  const room = results.locs.flatMap((l) => l.rooms).find((x) => x.id === c.roomId);
                  return (
                    <div key={c.id} className={`sync-line ${r?.ok ? 'ok' : 'bad'}`}>
                      {r?.ok ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                      <span><b>{room?.name}</b> · {c.platform}</span>
                      <em>{r?.ok ? `${r.events.length} sự kiện` : r?.error || 'Lỗi'}</em>
                    </div>
                  );
                })}
              </div>
              <button className="btn primary lg" onClick={onDone}>Vào ứng dụng <ArrowRight size={18} /></button>
            </>
          )}
        </section>
      )}

      {err && <p className="form-error">{err}</p>}

      {key !== 'finish' && (
        <div className="onb-foot">
          <button className="btn primary lg block" onClick={next}>
            {key === 'calendars' ? <>Tạo lịch <CalendarPlus size={18} /></> : <>Tiếp tục <ArrowRight size={18} /></>}
          </button>
        </div>
      )}
    </div>
  );
}
