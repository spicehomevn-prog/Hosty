// Các sàn và màu nhận diện (file thuần, dùng được cả ở máy chủ)
export const PLATFORMS = [
  { name: 'Airbnb', color: '#EF4F7A' },
  { name: 'Booking.com', color: '#3D7CF5' },
  { name: 'Agoda', color: '#9A6BFF' },
  { name: 'Traveloka', color: '#1FA7D8' },
  { name: 'Expedia', color: '#22A779' },
  { name: 'Trực tiếp', color: '#F0A132' },
];
const EXTRA = ['#E86A4A', '#6C7BEA', '#C25BC9', '#3AA6A0', '#B98A2E'];
export function platformColor(name = '') {
  const p = PLATFORMS.find((x) => x.name.toLowerCase() === name.trim().toLowerCase());
  if (p) return p.color;
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return EXTRA[h % EXTRA.length];
}
