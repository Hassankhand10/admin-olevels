import { ref, get } from 'firebase/database';
import { database } from '../config/firebase';

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
 * Known top-level RTDB roots (matches shared database.rules.json).
 * Root `/` is denied by rules — scan each child path instead of shallowPeek('').
 */
const KNOWN_RTDB_ROOTS = [
  'students',
  'teachers',
  'topics',
  'admin',
  'sessionProofs',
  'ai',
  'h5pContent',
  'pastPapers',
  'assignmentCategories',
  'assignments',
  'assignmentStudents',
  'profileTags',
  'timetable',
  'holidays',
  'activeClasses',
  'lessons',
  'themes',
  'wallpapers',
  'assessements',
  'rumbletalk',
  'groupBoard',
  'groupMessages',
  'groupConference',
  'conferenceSessions',
  'callLogs',
  'locks',
  'chats',
  'zoomMeetings',
  'playlists',
  'playlistCompletions',
  'rewards',
  'rewardCollection',
  'tiers',
  'downtimeSettings',
  'users',
  'Student-Notification',
  'CRMSettings',
  'ExamCRMResult',
  'claimWindowForceOpenIndex',
  'learningAideEvaluationReports',
  'StudentMonitoring',
  'notifications',
  'topicMeta',
  'topicIndexesStatus',
  'studentTopics',
  'studentIdTopics',
  'groupTopics',
  'ActivityCoins',
  'entryLogs',
  'gradingLocks',
  'sessions',
  'nuclei',
  'olevelsApp',
] as const;

/**
 * Per-root reads (root `/` is locked). Total ≈ composed JSON size of present branches.
 * Yields to the browser between branches so the page stays responsive.
 */
export async function scanRealtimeDatabaseNodeSizes(): Promise<RealtimeDbSizeScanResult> {
  try {
    const nodes: RealtimeDbNodeSizeRow[] = [];
    const entries: Array<{ key: string; valueJsonUtf8Bytes: number }> = [];

    for (let i = 0; i < KNOWN_RTDB_ROOTS.length; i++) {
      const key = KNOWN_RTDB_ROOTS[i];
      try {
        const snapshot = await get(ref(database, key));
        if (!snapshot.exists()) {
          if (i % 4 === 3) await yieldToMain();
          continue;
        }
        const childBytes = utf8JsonByteLength(snapshot.val());
        nodes.push({ path: `/${key}`, sizeBytes: childBytes });
        entries.push({ key, valueJsonUtf8Bytes: childBytes });
      } catch {
        // Permission or missing — skip branch.
      }
      if (i % 4 === 3) await yieldToMain();
    }

    nodes.sort((a, b) => b.sizeBytes - a.sizeBytes);
    const totalBytes = composeTopLevelObjectJsonUtf8Size(entries);
    return { nodes, totalBytes };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { nodes: [], totalBytes: 0, error: message };
  }
}
