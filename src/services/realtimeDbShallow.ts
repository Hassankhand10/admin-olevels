import { firebaseDatabaseURL } from '../config/firebase';

export type ShallowPeekResult =
  | { kind: 'missing' }
  | { kind: 'leaf'; value: unknown }
  | { kind: 'branch'; childKeys: string[] };

function buildJsonUrl(fullPath: string, query: string): string {
  const base = (firebaseDatabaseURL ?? '').replace(/\/+$/, '');
  if (!base) {
    throw new Error('VITE_FIREBASE_DATABASE_URL is not set');
  }
  const trimmed = fullPath.replace(/^\/+/, '');
  const suffix = trimmed
    ? `${trimmed.split('/').map((s) => encodeURIComponent(s)).join('/')}.json`
    : '.json';
  return `${base}/${suffix}${query ? `?${query}` : ''}`;
}

/**
 * Lists immediate child keys at `fullPath` without downloading values (REST `shallow=true`).
 * Same bandwidth pattern as Firebase console when listing keys.
 */
export async function shallowPeek(fullPath: string): Promise<ShallowPeekResult> {
  const url = buildJsonUrl(fullPath === '' ? '/' : fullPath, 'shallow=true');
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Shallow read failed (${res.status} ${res.statusText})`);
  }
  const data: unknown = await res.json();
  if (data === null) return { kind: 'missing' };
  if (typeof data !== 'object' || Array.isArray(data)) {
    return { kind: 'leaf', value: data };
  }
  const rec = data as Record<string, unknown>;
  const keys = Object.keys(rec);
  if (keys.length === 0) {
    return { kind: 'branch', childKeys: [] };
  }
  const allTrue = keys.every((k) => rec[k] === true);
  if (allTrue) {
    return { kind: 'branch', childKeys: keys.sort((a, b) => a.localeCompare(b)) };
  }
  return { kind: 'leaf', value: data };
}
