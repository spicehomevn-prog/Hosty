// Các font tiếng Việt không chân được đề xuất (Google Fonts, đều có subset vietnamese)
export const FONTS = [
  { id: 'Be Vietnam Pro', note: 'Thiết kế cho tiếng Việt, dấu cân đối, sang và hiện đại', tag: 'Đề xuất' },
  { id: 'Plus Jakarta Sans', note: 'Hình học mềm mại, cao cấp, hợp phong cách app', tag: 'Sang' },
  { id: 'Lexend', note: 'Rộng, thoáng, dễ đọc trên điện thoại', tag: 'Dễ đọc' },
  { id: 'Manrope', note: 'Tối giản, tinh tế, số liệu rõ ràng', tag: 'Tối giản' },
];

const loaded = new Set(['Be Vietnam Pro']);
export function ensureFont(name) {
  if (loaded.has(name)) return;
  loaded.add(name);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${name.replace(/ /g, '+')}:wght@400;500;600;700;800&display=swap`;
  document.head.appendChild(link);
}

export function applyFont(name) {
  ensureFont(name);
  document.documentElement.style.setProperty('--font', `'${name}', system-ui, sans-serif`);
}
