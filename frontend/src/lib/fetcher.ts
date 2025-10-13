// src/lib/fetcher.ts
export async function apiGet(path: string) {
  const r = await fetch(`/api/backend/${path}`, { credentials:'include', cache:'no-store' });
  if (!r.ok) throw new Error(`GET ${path} ${r.status}`);
  return r.json();
}
