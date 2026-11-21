import { useMemo } from 'react';
import { Users, Moon, DoorOpen, Ban, LogIn, Sparkles, ChevronRight, CalendarDays, MapPin } from '../lib/icons.jsx';
import { useStore } from '../lib/store.jsx';
import { allRooms } from '../lib/derive.js';
import { dm, diffDays } from '../lib/dates.js';
import { Sheet } from './ui.jsx';

/** Tình trạng từng phòng trong một ngày: có khách (đang ở / nhận hôm nay) hay còn trống */
export function roomStatus(state, bookings, day) {
  const real = bookings.filter((b) => !b.blocked);
  return allRooms(state).map((room) => {
    const mine = real.filter((b) => b.roomId === room.id);
    const stay = mine.find((b) => b.start <= day && b.end > day) || null;
    const out = mine.find((b) => b.end === day) || null;
    const next = mine.filter((b) => b.start > day).sort((a, b) => (a.start < b.start ? -1 : 1))[0] || null;
    const block = bookings.find((b) => b.blocked && b.roomId === room.id && b.start <= day && b.end > day) || null;
    return { room, stay, out, next, block };
  });
}

const guestOf = (b) => {
  const s = (b.summary || '').trim();
  // bỏ các tiêu đề chung chung của sàn (Airbnb "Reserved", Booking.com "CLOSED - Not available"…)
  return !s || /^(reserved|booked|blocked|closed)$|not available|unavailable/i.test(s) ? '' : s;
};

export default function OccupancySheet({ open, onClose, day, bookings, api }) {
  const { state } = useStore();
  const list = useMemo(() => (open ? roomStatus(state, bookings, day) : []), [open, state, bookings, day]);
  const busy = list.filter((r) => r.stay).sort((a, b) => Number(b.stay.start === day) - Number(a.stay.start === day));
  const free = list.filter((r) => !r.stay).sort((a, b) => Number(!!a.block) - Number(!!b.block));
  const multiLoc = state.locations.length > 1;
  const pct = list.length ? Math.round((busy.length / list.length) * 100) : 0;
  const go = (fn) => { onClose(); setTimeout(fn, 0); };

  return (
    <Sheet open={open} onClose={onClose} title="Công suất hôm nay"
      footer={<button className="btn ghost block" onClick={() => go(() => api.openDay(day))}><CalendarDays size={18} />Xem lịch ngày {dm(day)}</button>}>
      <div className="occ-sum">
        <div className="occ-stat busy"><Users size={20} /><b>{busy.length}</b><span>Có khách</span></div>
        <div className="occ-stat free"><DoorOpen size={20} /><b>{free.length}</b><span>Còn trống</span></div>
        <div className="occ-stat pct"><b>{pct}%</b><span>Công suất</span></div>
      </div>

      <h4 className="occ-h"><span className="pdot lg" style={{ background: 'var(--violet)' }} />Có khách đặt / đang ở · {busy.length}</h4>
      {busy.length === 0 && <p className="muted tiny occ-empty">Hôm nay chưa có phòng nào có khách.</p>}
      <div className="occ-list">
        {busy.map(({ room, stay, out }) => {
          const arriving = stay.start === day;
          const nights = diffDays(stay.start, stay.end);
          const guest = guestOf(stay);
          return (
            <button key={room.id} className="occ-room" onClick={() => go(() => api.openBooking(stay))}>
              <span className="occ-ico busy">{arriving ? <LogIn size={18} /> : <Moon size={18} />}</span>
              <span className="arr-main">
                <b>{room.name}</b>
                {multiLoc && <small className="occ-loc"><MapPin size={12} />{room.location.name}</small>}
                <small><span className="pdot" style={{ background: stay.color }} /> {stay.platform}{guest ? ` · ${guest}` : ''}</small>
                <small>{dm(stay.start)} → {dm(stay.end)} · {nights} đêm · trả {stay.checkOut}</small>
              </span>
              <span className="occ-tags">
                {arriving ? <em className="tag in">Nhận {stay.checkIn}</em> : <em className="tag stay">Đang ở</em>}
                {out && out.id !== stay.id && <em className="tag out">Khách cũ trả {out.checkOut}</em>}
              </span>
              <ChevronRight size={16} className="muted" />
            </button>
          );
        })}
      </div>

      <h4 className="occ-h"><span className="pdot lg" style={{ background: 'var(--green)' }} />Phòng còn trống · {free.length}</h4>
      {free.length === 0 && <p className="muted tiny occ-empty">Hết phòng trống hôm nay.</p>}
      <div className="occ-list">
        {free.map(({ room, out, next, block }) => {
          const Tag = next ? 'button' : 'div';
          return (
            <Tag key={room.id} className={`occ-room ${block ? 'blocked' : ''}`} {...(next ? { onClick: () => go(() => api.openBooking(next)) } : {})}>
              <span className={`occ-ico ${block ? 'block' : 'free'}`}>{block ? <Ban size={18} /> : <DoorOpen size={18} />}</span>
              <span className="arr-main">
                <b>{room.name}</b>
                {multiLoc && <small className="occ-loc"><MapPin size={12} />{room.location.name}</small>}
                {out && <small><Sparkles size={12} /> Khách trả hôm nay {out.checkOut} · cần dọn</small>}
                <small>{next ? `Khách tiếp: ${dm(next.start)} (${diffDays(day, next.start)} ngày nữa) · ${next.platform}` : 'Chưa có đặt phòng sắp tới'}</small>
              </span>
              <span className="occ-tags">{block ? <em className="tag block">Khoá trên sàn</em> : <em className="tag free">Trống</em>}</span>
              {next && <ChevronRight size={16} className="muted" />}
            </Tag>
          );
        })}
      </div>
    </Sheet>
  );
}
