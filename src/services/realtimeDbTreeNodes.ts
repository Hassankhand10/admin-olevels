import { ref, get } from 'firebase/database';
import { database } from '../config/firebase';
import { computeJsonExportUtf8Size, utf8JsonByteLength } from './realtimeDbSizeScan';

export type RealtimeDbTreeNode = {
  path: string;
  segment: string;
  depth: number;
  expanded: boolean;
  loaded: boolean;
  loading: boolean;
  /** True while subtree size is being fetched for a top-level row (background). */
  sizeLoading: boolean;
  expandable: boolean;
  subtreeBytes: number | null;
  /** Slice from parent `get`; used to expand without another download. */
  pendingValue: unknown | null;
  children: RealtimeDbTreeNode[];
};

export function toDbRefPath(fullPath: string): string {
  if (fullPath === '/') return '/';
  return fullPath.replace(/^\//, '');
}

export function hasExpandableChildren(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.length > 0;
  return Object.keys(value as Record<string, unknown>).length > 0;
}

export function stubRootChild(segment: string): RealtimeDbTreeNode {
  const path = `/${segment}`;
  return {
    path,
    segment,
    depth: 0,
    expanded: false,
    loaded: false,
    loading: false,
    sizeLoading: true,
    expandable: true,
    subtreeBytes: null,
    pendingValue: null,
    children: [],
  };
}

export function buildChildNodes(parentPath: string, depth: number, value: unknown): RealtimeDbTreeNode[] {
  if (value === null || typeof value !== 'object') return [];

  const entries: [string, unknown][] = Array.isArray(value)
    ? value.map((v, i) => [String(i), v])
    : Object.keys(value as Record<string, unknown>).map((k) => [
        k,
        (value as Record<string, unknown>)[k],
      ]);

  const rows: RealtimeDbTreeNode[] = entries.map(([seg, v]) => {
    const path = parentPath === '/' ? `/${seg}` : `${parentPath}/${seg}`;
    const isNested = v !== null && typeof v === 'object';
    const bytes = computeJsonExportUtf8Size(v);

    if (!isNested) {
      return {
        path,
        segment: seg,
        depth,
        expanded: false,
        loaded: true,
        loading: false,
        sizeLoading: false,
        expandable: false,
        subtreeBytes: utf8JsonByteLength(v),
        pendingValue: null,
        children: [],
      };
    }

    const expandable = hasExpandableChildren(v);
    return {
      path,
      segment: seg,
      depth,
      expanded: false,
      loaded: !expandable,
      loading: false,
      sizeLoading: false,
      expandable,
      subtreeBytes: bytes,
      pendingValue: expandable ? v : null,
      children: [],
    };
  });

  rows.sort((a, b) => (b.subtreeBytes ?? 0) - (a.subtreeBytes ?? 0));
  return rows;
}

export async function fetchValueAtPath(fullPath: string): Promise<unknown> {
  const dbPath = toDbRefPath(fullPath);
  const snapshot = await get(ref(database, dbPath));
  if (!snapshot.exists()) return null;
  return snapshot.val();
}
