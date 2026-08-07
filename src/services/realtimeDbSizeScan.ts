import { ref, get } from 'firebase/database';
import { database } from '../config/firebase';
import { shallowPeek } from './realtimeDbShallow';

/** UTF-8 byte length of JSON.stringify(value) — same as a downloaded JSON export for that value. */
export function utf8JsonByteLength(value: unknown): number {
  if (value === undefined) return 0;
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return 0;
  }
}

function utf8QuotedKeyColon(key: string): number {
  return new TextEncoder().encode(JSON.stringify(key) + ':').length;
}

/**
 * When the database root is a JSON object, exact UTF-8 size of the full object given each child's
 * `JSON.stringify(child)` byte length (same as summing branch export sizes with `{` `}` and commas).
 */
export function composeTopLevelObjectJsonUtf8Size(
  entries: Array<{ key: string; valueJsonUtf8Bytes: number }>
): number {
  let totalBytes = 2;
  for (let i = 0; i < entries.length; i++) {
    if (i > 0) totalBytes += 1;
    totalBytes += utf8QuotedKeyColon(entries[i].key) + entries[i].valueJsonUtf8Bytes;
  }
  return totalBytes;
}

/** Exact UTF-8 length of JSON.stringify(value) for a value tree (export size). */
export function computeJsonExportUtf8Size(value: unknown): number {
  if (value === undefined) return 0;
  if (value === null || typeof value !== 'object') return utf8JsonByteLength(value);
  if (Array.isArray(value)) {
    let total = 2;
    for (let i = 0; i < value.length; i++) {
      if (i > 0) total += 1;
      total += utf8JsonByteLength(value[i]);
    }
    return total;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj);
  let totalBytes = 2;
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (i > 0) totalBytes += 1;
    totalBytes += utf8QuotedKeyColon(k) + utf8JsonByteLength(obj[k]);
  }
  return totalBytes;
}

const yieldToMain = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export type RealtimeDbNodeSizeRow = { path: string; sizeBytes: number };

export type RealtimeDbSizeScanResult = {
  nodes: RealtimeDbNodeSizeRow[];
  totalBytes: number;
  error?: string;
};

/**
 * Shallow root key list, then one read per top-level branch (profiler-friendly paths):
 * - Total size = exact UTF-8 length of JSON.stringify(root) composed from child export sizes.
 * - Rows = top-level keys only, each row size = UTF-8 JSON size of that branch.
 * Yields to the browser between branches so the page stays responsive.
 */
export async function scanRealtimeDatabaseNodeSizes(): Promise<RealtimeDbSizeScanResult> {
  try {
    const peek = await shallowPeek('');
    if (peek.kind === 'missing') {
      return { nodes: [], totalBytes: 0 };
    }

    if (peek.kind === 'leaf') {
      const totalBytes = utf8JsonByteLength(peek.value);
      return { nodes: [{ path: '/', sizeBytes: totalBytes }], totalBytes };
    }

    const keys = peek.childKeys;
    const entries: Array<{ key: string; valueJsonUtf8Bytes: number }> = [];
    const nodes: RealtimeDbNodeSizeRow[] = [];

    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const childSnap = await get(ref(database, k));
      const childVal = childSnap.exists() ? childSnap.val() : undefined;
      const childBytes = utf8JsonByteLength(childVal);
      entries.push({ key: k, valueJsonUtf8Bytes: childBytes });
      nodes.push({ path: `/${k}`, sizeBytes: childBytes });
      if (i % 4 === 3) await yieldToMain();
    }

    const isArrayRoot =
      keys.length > 0 && keys.every((k) => /^\d+$/.test(k));
    let totalBytes: number;
    if (isArrayRoot) {
      totalBytes = 2;
      for (let i = 0; i < entries.length; i++) {
        if (i > 0) totalBytes += 1;
        totalBytes += entries[i].valueJsonUtf8Bytes;
      }
    } else {
      totalBytes = composeTopLevelObjectJsonUtf8Size(entries);
    }

    nodes.sort((a, b) => b.sizeBytes - a.sizeBytes);
    return { nodes, totalBytes };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { nodes: [], totalBytes: 0, error: message };
  }
}
