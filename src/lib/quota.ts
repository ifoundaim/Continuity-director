export type Endpoint = "generate" | "edit" | "fuse" | "describe";

const KEY = "cd_quota_v1";  // continuity director daily quota
const DAILY_LIMIT = 100;

type Quota = { date: string; counts: Record<Endpoint, number>; total: number };

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

export function loadQuota(): Quota {
  if (typeof window === 'undefined') {
    // Server-side: return empty quota
    return { date: today(), counts: { generate:0, edit:0, fuse:0, describe:0 }, total: 0 };
  }
  
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const q = JSON.parse(raw) as Quota;
      if (q.date === today()) return q;
    }
  } catch {}
  const fresh: Quota = { date: today(), counts: { generate:0, edit:0, fuse:0, describe:0 }, total: 0 };
  localStorage.setItem(KEY, JSON.stringify(fresh));
  return fresh;
}

export function bump(ep: Endpoint) {
  if (typeof window === 'undefined') {
    // Server-side: no-op
    return { date: today(), counts: { generate:0, edit:0, fuse:0, describe:0 }, total: 0 };
  }
  
  const q = loadQuota();
  q.counts[ep] += 1;
  q.total += 1;
  localStorage.setItem(KEY, JSON.stringify(q));
  return q;
}

export function getTotals() {
  const q = loadQuota();
  return { ...q, limit: DAILY_LIMIT, remaining: Math.max(DAILY_LIMIT - q.total, 0) };
}

export function resetQuota() {
  if (typeof window === 'undefined') {
    // Server-side: no-op
    return { date: today(), counts: { generate:0, edit:0, fuse:0, describe:0 }, total: 0 };
  }
  
  localStorage.removeItem(KEY);
  return loadQuota();
}
