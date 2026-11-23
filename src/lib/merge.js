// Gộp ba bên (base = bản đã đồng bộ lần trước, local = máy này, remote = máy chủ).
// Chỗ nào máy này đã sửa so với base thì giữ bản máy này, còn lại lấy bản máy chủ.
// Mảng phần tử có id gộp theo từng phần tử, object gộp theo từng khoá.

export const SYNC_KEYS = ['property', 'locations', 'calendars', 'manual', 'overrides', 'notes', 'tasks', 'cleanDone', 'cleanAdj', 'cleanExtra', 'setupDone'];
const DEFAULTS = {
  property: { name: '' }, locations: [], calendars: [], manual: [], overrides: {}, notes: {}, tasks: [], cleanDone: {}, cleanAdj: {}, cleanExtra: [], setupDone: false,
};
/** Lấy phần dữ liệu được đồng bộ; khoá thiếu / null lấy giá trị mặc định để so sánh nhất quán */
export const pickSync = (s) => Object.fromEntries(SYNC_KEYS.map((k) => [k, s?.[k] ?? DEFAULTS[k]]));

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isIdArray = (v) => Array.isArray(v) && v.every((x) => isObj(x) && x.id != null);

export function deepEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return (a ?? null) === (b ?? null);
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  if (isObj(a)) {
    if (!isObj(b)) return false;
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) if (!deepEqual(a[k], b[k])) return false;
    return true;
  }
  return false;
}

function mergeObj(base, local, remote) {
  const out = {};
  const keys = new Set([...Object.keys(local), ...Object.keys(remote), ...Object.keys(base)]);
  for (const k of keys) {
    const v = merge3(base[k], local[k], remote[k]);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function mergeIdArray(base, local, remote) {
  const B = new Map(base.map((x) => [x.id, x]));
  const L = new Map(local.map((x) => [x.id, x]));
  const R = new Map(remote.map((x) => [x.id, x]));
  const order = [...remote.map((x) => x.id), ...local.map((x) => x.id).filter((id) => !R.has(id))];
  const out = [];
  for (const id of order) {
    const v = merge3(B.get(id), L.get(id), R.get(id));
    if (v !== undefined) out.push(v);
  }
  return out;
}

export function merge3(base, local, remote) {
  if (deepEqual(local, base)) return remote;
  if (deepEqual(remote, base)) return local;
  if (deepEqual(local, remote)) return local;
  if (isIdArray(local) && isIdArray(remote) && (base == null || isIdArray(base))) return mergeIdArray(base || [], local, remote);
  if (isObj(local) && isObj(remote) && (base == null || isObj(base))) return mergeObj(base || {}, local, remote);
  return local; // cùng sửa một chỗ: máy đồng bộ sau thắng
}
