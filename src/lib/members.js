import { useEffect, useState } from 'react';
import { useSession } from './session.jsx';

const cache = new Map();

/** Danh sách tài khoản của cơ sở đang mở (để giao task / hiện tên người làm) */
export function useMembers() {
  const { token, workspace, call } = useSession();
  const ws = workspace?.id;
  const [members, setMembers] = useState(() => cache.get(ws) || []);
  useEffect(() => {
    if (!token || !ws) return undefined;
    let alive = true;
    call(`/api/auth?members=1&ws=${ws}`)
      .then((r) => { cache.set(ws, r.members); if (alive) setMembers(r.members); })
      .catch(() => {});
    return () => { alive = false; };
  }, [token, ws]); // eslint-disable-line react-hooks/exhaustive-deps
  return members;
}
