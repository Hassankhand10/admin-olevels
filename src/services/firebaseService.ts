import { ref, get, update } from 'firebase/database';
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  Timestamp,
  orderBy,
  type Query,
  type QuerySnapshot,
} from 'firebase/firestore';
import { database, firestore } from '../config/firebase';
import { Assignment, StudentData, WeeklyTestListItem } from '../types';
import { shallowPeek } from './realtimeDbShallow';

type TopicListEntry = { course: any; name?: string };

/** Topic name keys only via REST shallow — never downloads the fat /topics tree. */
async function listTopicKeysLight(): Promise<string[]> {
  const peek = await shallowPeek('topics');
  if (peek.kind === 'branch') return peek.childKeys;
  return [];
}

async function mapInChunks<T, R>(
  items: T[],
  chunkSize: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    out.push(...(await Promise.all(chunk.map(mapper))));
  }
  return out;
}

const ASSIGNMENTS_COL = 'Assignments';
const ASSIGNMENT_STUDENTS_COL = 'AssignmentStudents';
const ASSIGNMENT_BOARDS_COL = 'AssignmentBoards';

/** Retry transient Firestore failures (quota / network blips). */
async function getDocsWithRetry(
  q: Query,
  attempts = 2
): Promise<QuerySnapshot> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await getDocs(q);
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 250 * 2 ** i));
      }
    }
  }
  throw lastError;
}

/** Run many queries; keep successful snapshots even if some fail. */
async function getDocsAllSettled(queries: Query[]): Promise<QuerySnapshot[]> {
  const results = await Promise.allSettled(queries.map((q) => getDocsWithRetry(q)));
  const snaps: QuerySnapshot[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      snaps.push(result.value);
    } else {
      console.error('Firestore query failed (kept other results):', result.reason);
    }
  }
  return snaps;
}

/** Firestore doc id: `{topic}__{encodeURIComponent(title)}` */
export function buildAssignmentDocId(topic: string, title: string): string {
  return `${topic}__${encodeURIComponent(title)}`;
}

/** Unique non-empty topic keys to try (RTDB id + display name often both appear on Firestore docs). */
function topicLookupKeys(topic: string, topicName?: string | null): string[] {
  const keys: string[] = [];
  const push = (v: unknown) => {
    if (typeof v !== 'string') return;
    const t = v.trim();
    if (!t || keys.includes(t)) return;
    keys.push(t);
  };
  push(topic);
  push(topicName);
  return keys;
}

export function encodeStudentNameForFirestore(name: string): string {
  return String(name ?? '').replace(/\//g, '__SLASH__');
}

export function decodeStudentNameFromFirestore(encoded: string): string {
  return String(encoded ?? '').replace(/__SLASH__/g, '/');
}

export const WEEKLY_TEST_LOOKBACK_DAYS = 30;
export const WEEKLY_TEST_LOOKBACK_MS = WEEKLY_TEST_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

export function getWeeklyTestCutoffDate(): Date {
  return new Date(Date.now() - WEEKLY_TEST_LOOKBACK_MS);
}

/** Default `<input type="date">` range for dashboard / teacher report — last 30 days (1 month). */
export function getTeacherReportDefaultDateRange(): { startDate: string; endDate: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const toYmd = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const end = new Date();
  const start = new Date(Date.now() - WEEKLY_TEST_LOOKBACK_MS);
  return { startDate: toYmd(start), endDate: toYmd(end) };
}

/** Inclusive date range for weekly-test queries (Firestore live + archive). */
export type AssignmentDateWindow = { from: Date; to: Date };

/** Maps dashboard `<input type="date">` strings to an inclusive [from, to] window (local time). */
export function parseDashboardDateFilterToWindow(
  startDate: string,
  endDate: string
): AssignmentDateWindow {
  const from = startDate
    ? new Date(`${startDate}T00:00:00`)
    : getWeeklyTestCutoffDate();
  const to = endDate ? new Date(`${endDate}T23:59:59.999`) : new Date();
  return { from, to };
}

export function getAssignmentReferenceDate(data: Assignment): Date | null {
  if (data.creationDate != null && typeof data.creationDate === 'number') {
    const d = new Date(data.creationDate);
    if (!isNaN(d.getTime())) return d;
  }
  if (data.deadline) {
    const d = new Date(data.deadline);
    if (!isNaN(d.getTime())) return d;
  }
  if (data.gradingDeadline) {
    const d = new Date(data.gradingDeadline);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function isAssignmentInDateWindow(data: Assignment, range: AssignmentDateWindow): boolean {
  const ref = getAssignmentReferenceDate(data);
  // If we cannot resolve a date, keep the assignment visible rather than hiding it.
  if (!ref) return true;
  return ref.getTime() >= range.from.getTime() && ref.getTime() <= range.to.getTime();
}

function coerceFirestoreTimestampLike(raw: unknown): Date | null {
  if (raw == null) return null;
  if (raw instanceof Timestamp) return raw.toDate();
  if (typeof raw === 'number') {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof raw === 'string') {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof raw === 'object' && raw !== null && 'toDate' in raw && typeof (raw as { toDate?: () => Date }).toDate === 'function') {
    const d = (raw as { toDate: () => Date }).toDate();
    return d instanceof Date && !isNaN(d.getTime()) ? d : null;
  }
  // RTDB / JSON Firestore-style map: { seconds, nanoseconds? } or {_seconds}
  if (typeof raw === 'object' && raw !== null) {
    const o = raw as { seconds?: unknown; _seconds?: unknown };
    const sec = typeof o.seconds === 'number' ? o.seconds : typeof o._seconds === 'number' ? o._seconds : null;
    if (sec != null && Number.isFinite(sec)) {
      const d = new Date(sec * 1000);
      return !isNaN(d.getTime()) ? d : null;
    }
  }
  return null;
}

function firestoreAssignmentDocToAssignment(raw: Record<string, unknown>): Assignment {
  const deadlineD = coerceFirestoreTimestampLike(raw.deadline);
  const gradingD = coerceFirestoreTimestampLike(raw.gradingDeadline);
  let creationDate: number | undefined;
  const cRaw = raw.creationDate;
  if (typeof cRaw === 'number') creationDate = cRaw;
  else if (cRaw instanceof Timestamp) creationDate = cRaw.toMillis();
  else if (cRaw && typeof cRaw === 'object' && 'toMillis' in cRaw && typeof (cRaw as { toMillis: () => number }).toMillis === 'function') {
    creationDate = (cRaw as { toMillis: () => number }).toMillis();
  }

  const base: Assignment = {
    title: String(raw.title ?? raw.assignmentTitle ?? ''),
    deadline: deadlineD ? deadlineD.toISOString() : String(raw.deadline ?? ''),
    gradingDeadline: gradingD ? gradingD.toISOString() : String(raw.gradingDeadline ?? ''),
    totalMarks: String(raw.totalMarks ?? ''),
    weightage: Number(raw.weightage ?? 0),
    selectedAssignmentCategory: String(
      raw.selectedAssignmentCategory ?? raw.type ?? 'WeeklyTest'
    ),
    teacherName: String(raw.teacherName ?? ''),
    creationDate,
  };

  const withAliases = { ...raw, ...base } as Assignment;
  const mode = resolveWeeklyTestGradingMode(withAliases);
  if (mode) base.weeklyTestGradingMode = mode;
  const aiStatus = pickAiAssignmentStatus(withAliases);
  if (aiStatus) base.aiAssignmentStatus = aiStatus;
  const processingStatus = pickAiAssignmentProcessingStatus(withAliases);
  if (processingStatus) base.aiAssignmentProcessingStatus = processingStatus;
  const aiId = pickAiAssignmentId(withAliases);
  if (aiId) base.aiAssignmentId = aiId;
  const gradingRun = pickAiGradingStatus(withAliases);
  if (gradingRun) base.aiGradingStatus = gradingRun;
  const submissionCount = pickFiniteCount(raw.submissions ?? raw.submissionCount);
  if (submissionCount != null) base.submissionCount = submissionCount;
  const gradedCount = pickFiniteCount(raw.grading ?? raw.gradedCount);
  if (gradedCount != null) base.gradedCount = gradedCount;

  return base;
}

function archivedFirestoreDocToAssignment(
  _docId: string,
  raw: Record<string, unknown>
): Assignment {
  return firestoreAssignmentDocToAssignment(raw);
}

function isAssignmentArchived(raw: Record<string, unknown>): boolean {
  return raw.archived === true;
}

async function fetchLiveAssignmentsFromFirestore(
  topic: string,
  topicName?: string | null
): Promise<{ id: string; data: Assignment }[]> {
  const col = collection(firestore, ASSIGNMENTS_COL);
  const keys = topicLookupKeys(topic, topicName);
  const queries = keys.flatMap((k) => [
    query(col, where('topic', '==', k)),
    query(col, where('topicId', '==', k)),
  ]);
  const snapshots = await getDocsAllSettled(queries);

  // If every query failed, surface the error so callers can keep previous UI data.
  if (snapshots.length === 0 && queries.length > 0) {
    throw new Error(`All Firestore assignment queries failed for topic "${topic}"`);
  }

  const byId = new Map<string, { id: string; data: Assignment }>();
  for (const snap of snapshots) {
    snap.forEach((docSnap) => {
      const raw = docSnap.data() as Record<string, unknown>;
      if (isAssignmentArchived(raw)) return;
      const data = firestoreAssignmentDocToAssignment(raw);
      if (!data.title?.trim()) return;
      byId.set(docSnap.id, { id: docSnap.id, data });
    });
  }
  return Array.from(byId.values());
}

async function fetchAssignmentStudentsFromFirestore(
  topic: string,
  assignmentTitle: string,
  topicName?: string | null
): Promise<StudentData> {
  const keys = topicLookupKeys(topic, topicName);
  const merged: StudentData = {};

  for (const key of keys) {
    const assignmentDocId = buildAssignmentDocId(key, assignmentTitle);
    const studentsCol = collection(
      firestore,
      ASSIGNMENT_STUDENTS_COL,
      assignmentDocId,
      'students'
    );
    try {
      const snapshot = await getDocsWithRetry(studentsCol);
      if (snapshot.empty) continue;
      snapshot.forEach((docSnap) => {
        const name = decodeStudentNameFromFirestore(docSnap.id);
        // Prefer first non-empty hit; later keys only fill gaps
        if (!merged[name]) {
          merged[name] = docSnap.data() as StudentData[string];
        }
      });
      // Found a populated students subcollection — no need to try more keys
      if (Object.keys(merged).length > 0) break;
    } catch (error) {
      console.error(
        `Error loading AssignmentStudents for ${assignmentDocId}:`,
        error
      );
    }
  }

  return merged;
}

function getArchivedDocReferenceDate(raw: Record<string, unknown>, data: Assignment): Date | null {
  const fromFields =
    coerceFirestoreTimestampLike(raw.archivedAt) ||
    coerceFirestoreTimestampLike(raw.archiveDate) ||
    coerceFirestoreTimestampLike(raw.creationDate);
  if (fromFields) return fromFields;
  return getAssignmentReferenceDate(data);
}

const WEEKLY_TEST_CATEGORY = 'WeeklyTest' as const;

async function fetchArchivedWeeklyTestDocsForTopic(
  topic: string,
  dateWindow?: AssignmentDateWindow,
  topicName?: string | null
): Promise<WeeklyTestListItem[]> {
  const range = dateWindow ?? {
    from: getWeeklyTestCutoffDate(),
    to: new Date(),
  };
  const creationDateFrom = Timestamp.fromDate(range.from);
  const creationDateTo = Timestamp.fromDate(range.to);

  const col = collection(firestore, 'Archived-Assignments');
  const keys = topicLookupKeys(topic, topicName);

  const snapshots = await getDocsAllSettled(
    keys.flatMap((k) => [
      query(
        col,
        where('topic', '==', k),
        where('selectedAssignmentCategory', '==', WEEKLY_TEST_CATEGORY),
        where('creationDate', '>=', creationDateFrom),
        where('creationDate', '<=', creationDateTo)
      ),
      query(
        col,
        where('topicId', '==', k),
        where('selectedAssignmentCategory', '==', WEEKLY_TEST_CATEGORY),
        where('creationDate', '>=', creationDateFrom),
        where('creationDate', '<=', creationDateTo)
      ),
    ])
  );
  const byId = new Map<string, WeeklyTestListItem>();

  for (const snap of snapshots) {
    snap.forEach((docSnap) => {
      const raw = docSnap.data() as Record<string, unknown>;

      const data = archivedFirestoreDocToAssignment(docSnap.id, raw);
      const refDate = getArchivedDocReferenceDate(raw, data);
      if (!refDate || refDate < range.from || refDate > range.to) return;
      if (!data.title?.trim()) return;

      byId.set(docSnap.id, {
        id: docSnap.id,
        data,
        firestoreDocId: docSnap.id,
        archivedFirestoreDocId: docSnap.id,
      });
    });
  }

  return Array.from(byId.values());
}

/**
 * Active weekly tests from Firestore `Assignments`, filtered by date window.
 */
export async function fetchWeeklyTestsFromFirestore(
  topic: string,
  dateWindow?: AssignmentDateWindow,
  topicName?: string | null
): Promise<WeeklyTestListItem[]> {
  const range = dateWindow ?? {
    from: getWeeklyTestCutoffDate(),
    to: new Date(),
  };
  const assignments = await fetchLiveAssignmentsFromFirestore(topic, topicName);
  const out: WeeklyTestListItem[] = [];

  for (const { id, data } of assignments) {
    if (!isWeeklyTestCategory(data.selectedAssignmentCategory)) continue;
    if (!isAssignmentInDateWindow(data, range)) continue;
    out.push({ id, data, firestoreDocId: id });
  }
  return out;
}

/**
 * One collection query for all live weekly tests in a date window, grouped by topic id.
 * Much faster than querying every topic separately.
 */
export async function fetchAllWeeklyTestsGroupedByTopic(
  dateWindow?: AssignmentDateWindow,
  topics?: { [key: string]: { course: any; name?: string } }
): Promise<{ [topicId: string]: WeeklyTestListItem[] }> {
  const range = dateWindow ?? {
    from: getWeeklyTestCutoffDate(),
    to: new Date(),
  };
  const topicMap = topics ?? (await fetchTopics());
  const col = collection(firestore, ASSIGNMENTS_COL);
  const snapshots = await getDocsAllSettled([
    query(col, where('selectedAssignmentCategory', 'in', ['WeeklyTest', 'WeeklyTest preparation'])),
  ]);

  if (snapshots.length === 0) {
    throw new Error('Collection weekly-test query failed');
  }

  const grouped: { [topicId: string]: WeeklyTestListItem[] } = {};
  for (const snap of snapshots) {
    snap.forEach((docSnap) => {
      const raw = docSnap.data() as Record<string, unknown>;
      if (isAssignmentArchived(raw)) return;
      const data = firestoreAssignmentDocToAssignment(raw);
      if (!isWeeklyTestCategory(data.selectedAssignmentCategory)) return;
      if (!isAssignmentInDateWindow(data, range)) return;
      if (!data.title?.trim()) return;
      const topicId = resolveTopicIdFromAssignmentRaw(raw, topicMap);
      if (!grouped[topicId]) grouped[topicId] = [];
      grouped[topicId].push({ id: docSnap.id, data, firestoreDocId: docSnap.id });
    });
  }
  return grouped;
}

/**
 * Weekly tests for admin UI: Firestore live assignments + archived docs, deduped by title.
 */
export async function fetchWeeklyTestsForTopic(
  topic: string,
  dateWindow?: AssignmentDateWindow,
  topicName?: string | null
): Promise<WeeklyTestListItem[]> {
  const range = dateWindow ?? {
    from: getWeeklyTestCutoffDate(),
    to: new Date(),
  };
  const live = await fetchWeeklyTestsFromFirestore(topic, range, topicName);
  const archived = await fetchArchivedWeeklyTestDocsForTopic(topic, range, topicName);

  const seenTitles = new Set<string>();
  const merged: WeeklyTestListItem[] = [];

  for (const item of live) {
    const key = item.data.title.trim().toLowerCase();
    seenTitles.add(key);
    merged.push(item);
  }
  for (const item of archived) {
    const key = item.data.title.trim().toLowerCase();
    if (seenTitles.has(key)) continue;
    seenTitles.add(key);
    merged.push(item);
  }

  merged.sort((a, b) => {
    const da = getAssignmentReferenceDate(a.data)?.getTime() ?? 0;
    const db = getAssignmentReferenceDate(b.data)?.getTime() ?? 0;
    return db - da;
  });

  return merged;
}

/**
 * Light topic list (keys + course only). Shallow keys + per-topic course reads —
 * never downloads the full /topics tree. Session-cached for dashboard badges.
 */
let topicsSessionCache: {
  at: number;
  value: {[key: string]: TopicListEntry};
} | null = null;
const TOPICS_SESSION_CACHE_MS = 60_000;

export const fetchTopics = async (): Promise<{[key: string]: TopicListEntry}> => {
  try {
    if (
      topicsSessionCache &&
      Date.now() - topicsSessionCache.at < TOPICS_SESSION_CACHE_MS
    ) {
      return topicsSessionCache.value;
    }
    const keys = await listTopicKeysLight();
    if (!keys.length) {
      return {};
    }

    const topicsWithCourses: {[key: string]: TopicListEntry} = {};
    await mapInChunks(keys, 25, async (topicKey) => {
      const courseSnap = await get(ref(database, `topics/${topicKey}/course`));
      topicsWithCourses[topicKey] = {
        course: courseSnap.val() || null,
        name: topicKey,
      };
      return topicKey;
    });
    topicsSessionCache = { at: Date.now(), value: topicsWithCourses };
    return topicsWithCourses;
  } catch (error) {
    return {};
  }
};

/** Weekly tests only: Firestore Assignments + Archived-Assignments, filtered by `dateWindow`. */
export const fetchAssignments = async (
  topic: string,
  dateWindow?: AssignmentDateWindow,
  topicName?: string | null
): Promise<WeeklyTestListItem[]> => {
  return fetchWeeklyTestsForTopic(topic, dateWindow, topicName);
};

export const fetchStudentSubmissions = async (
  topic: string,
  assignmentTitle: string,
  topicName?: string | null
): Promise<StudentData> => {
  return fetchAssignmentStudentsFromFirestore(topic, assignmentTitle, topicName);
};

/**
 * Student submissions: Firestore `AssignmentStudents` for live assignments,
 * or merged chunks from `Archived-Assignments-Students` when archived.
 */
export async function fetchWeeklyTestStudentSubmissions(
  topic: string,
  assignmentTitle: string,
  archivedFirestoreDocId?: string
): Promise<StudentData> {
  if (!archivedFirestoreDocId) {
    return fetchAssignmentStudentsFromFirestore(topic, assignmentTitle);
  }
  const col = collection(firestore, 'Archived-Assignments-Students');
  const q = query(col, where('assignmentId', '==', archivedFirestoreDocId));
  const snapshot = await getDocs(q);
  const merged: StudentData = {};
  snapshot.forEach((docSnap) => {
    const docData = docSnap.data() as { students?: StudentData };
    if (docData.students && typeof docData.students === 'object') {
      Object.assign(merged, docData.students);
    }
  });
  return merged;
}

export const fetchStudentCategories = async (
  topic: string
): Promise<{[studentName: string]: {category: string}}> => {
  const studentsRef = ref(database, `topics/${topic}/students`);
  const snapshot = await get(studentsRef);

  if (snapshot.exists()) {
    return snapshot.val() as {[studentName: string]: {category: string}};
  }
  return {};
};

export const updateStudentGrade = async (
  topic: string,
  assignmentTitle: string,
  studentName: string,
  marks: number,
  feedback: string
): Promise<void> => {
  const assignmentDocId = buildAssignmentDocId(topic, assignmentTitle);
  const studentDocId = encodeStudentNameForFirestore(studentName);
  const studentRef = doc(
    firestore,
    ASSIGNMENT_STUDENTS_COL,
    assignmentDocId,
    'students',
    studentDocId
  );

  await updateDoc(studentRef, {
    graded: true,
    marks,
    feedback,
  });
};

/** Blocks accidental RTDB reads/writes on migrated assignment paths. */
function assertNotAssignmentRtdbPath(path: string): void {
  const normalized = path.replace(/^\/+/, '');
  if (
    normalized.startsWith('assignments/') ||
    normalized.startsWith('assignmentStudents/') ||
    normalized === 'assignments' ||
    normalized === 'assignmentStudents'
  ) {
    throw new Error(
      `RTDB path "${path}" is not allowed for assignments — use Firestore Assignments / AssignmentStudents.`
    );
  }
}

// Generic update function for any Firebase Realtime Database path (non-assignment data).
export const updateFirebaseData = async (
  path: string,
  data: Record<string, unknown>
): Promise<void> => {
  assertNotAssignmentRtdbPath(path);
  const refPath = ref(database, path);
  await update(refPath, data);
};

export const updateSupervisionApproval = async (
  topic: string,
  assignmentTitle: string,
  studentName: string,
  approvalValue: string | null
): Promise<void> => {
  const assignmentDocId = buildAssignmentDocId(topic, assignmentTitle);
  const studentDocId = encodeStudentNameForFirestore(studentName);
  const studentRef = doc(
    firestore,
    ASSIGNMENT_STUDENTS_COL,
    assignmentDocId,
    'students',
    studentDocId
  );

  if (!approvalValue) {
    await updateDoc(studentRef, {
      supervisionApproval: null,
      supervisionApprovalDate: null,
    });
  } else {
    await updateDoc(studentRef, {
      supervisionApproval: approvalValue,
      supervisionApprovalDate: new Date().getTime(),
    });
  }
};

// Fetch all students from database (shallow keys + per-student id fields only).
export const fetchAllStudents = async (): Promise<Array<{name: string, studentId: string}>> => {
  try {
    const peek = await shallowPeek('students');
    if (peek.kind !== 'branch' || peek.childKeys.length === 0) {
      return [];
    }

    const studentsList = await mapInChunks(peek.childKeys, 40, async (studentName) => {
      const [studentIdSnap, idSnap] = await Promise.all([
        get(ref(database, `students/${studentName}/studentId`)),
        get(ref(database, `students/${studentName}/id`)),
      ]);
      const rawId = studentIdSnap.exists()
        ? studentIdSnap.val()
        : idSnap.exists()
          ? idSnap.val()
          : '';
      return {
        name: studentName,
        studentId: String(rawId ?? ''),
      };
    });

    studentsList.sort((a, b) => a.name.localeCompare(b.name));
    return studentsList;
  } catch (error) {
    return [];
  }
};

/**
 * Assignment definitions for a topic from Firestore `Assignments` (non-archived only).
 * Throws when every underlying query fails so callers can retain previous UI data.
 */
export const fetchAssignmentsFromFirestoreForTopic = async (
  topic: string,
  topicName?: string | null
): Promise<{ id: string; data: Assignment }[]> => {
  return fetchLiveAssignmentsFromFirestore(topic, topicName);
};

/** All assignment types for a topic — Firestore `Assignments` collection. */
export const fetchAllAssignments = fetchAssignmentsFromFirestoreForTopic;

export const PAST_PAPER_PRACTICE_CATEGORIES = ['PastPaper Practice', 'PastPaperPractice'] as const;

export function isPastPaperPracticeCategory(category: string | undefined): boolean {
  if (!category) return false;
  const compact = category.trim().toLowerCase().replace(/\s+/g, '');
  return compact === 'pastpaperpractice';
}

/** Weekly test categories (not past paper). */
export function isWeeklyTestCategory(category: string | undefined): boolean {
  if (!category) return false;
  const normalized = category.trim().toLowerCase().replace(/\s+/g, ' ');
  return (
    normalized === 'weeklytest' ||
    normalized === 'weekly test' ||
    normalized === 'weeklytest preparation' ||
    normalized === 'weekly test preparation'
  );
}

export function isWeeklyTestOrPastPaperCategory(category: string | undefined): boolean {
  return isWeeklyTestCategory(category) || isPastPaperPracticeCategory(category);
}

export const AI_GRADING_STATUS_IN_PROCESS = 'AI_GRADING_STATUS_IN_PROCESS' as const;

/** Lowercase trimmed string for stable comparisons (`''` if missing / not a string). */
export function normalizeAiStatusToken(raw: unknown): string {
  if (raw == null || typeof raw !== 'string') return '';
  return raw.trim().toLowerCase();
}

function pickNonEmptyString(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === 'string') {
    const t = v.trim();
    return t === '' ? undefined : t;
  }
  return undefined;
}

function pickFiniteCount(v: unknown): number | undefined {
  if (typeof v === 'boolean' || v == null) return undefined;
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.trim());
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return undefined;
}

function pickStatusFromNestedAiAssignment(r: Record<string, unknown>): string | undefined {
  const nested = r.aiAssignment;
  if (!nested || typeof nested !== 'object' || Array.isArray(nested)) return undefined;
  const o = nested as Record<string, unknown>;
  return pickNonEmptyString(o.status) ?? pickNonEmptyString(o.aiAssignmentStatus);
}

/**
 * Reads `aiAssignmentStatus` from assignment objects (camelCase or snake_case aliases).
 */
export function pickAiAssignmentStatus(data: Assignment): string | undefined {
  const r = data as unknown as Record<string, unknown>;
  return (
    pickNonEmptyString(data.aiAssignmentStatus) ??
    pickNonEmptyString(r.ai_assignment_status) ??
    pickNonEmptyString(r.aiAssignment_status) ??
    pickStatusFromNestedAiAssignment(r)
  );
}

/**
 * Reads Learning Aide `processingStatus` (`aiAssignmentProcessingStatus`).
 */
export function pickAiAssignmentProcessingStatus(
  data: Assignment | Record<string, unknown>
): string | undefined {
  const r = data as Record<string, unknown>;
  const nested = r.aiAssignment;
  const nestedStatus =
    nested && typeof nested === 'object' && !Array.isArray(nested)
      ? pickNonEmptyString((nested as Record<string, unknown>).processingStatus)
      : undefined;
  return (
    pickNonEmptyString(r.aiAssignmentProcessingStatus) ??
    pickNonEmptyString(r.ai_assignment_processing_status) ??
    nestedStatus
  );
}

/**
 * Reads `aiGradingStatus` (in-process run flag) from assignment objects.
 */
export function pickAiGradingStatus(data: Assignment | Record<string, unknown>): string | undefined {
  const r = data as Record<string, unknown>;
  return (
    pickNonEmptyString(r.aiGradingStatus) ??
    pickNonEmptyString(r.ai_grading_status) ??
    pickNonEmptyString(r.aiGrading_status)
  );
}

/**
 * Reads `aiAssignmentId` from assignment objects (camelCase or snake_case aliases).
 */
export function pickAiAssignmentId(data: Assignment): string | undefined {
  const r = data as unknown as Record<string, unknown>;
  const pick = (v: unknown): string | undefined => {
    if (v == null) return undefined;
    if (typeof v === 'string') {
      const t = v.trim();
      return t === '' ? undefined : t;
    }
    if (typeof v === 'number' && Number.isFinite(v)) {
      return String(v);
    }
    return undefined;
  };
  return pick(data.aiAssignmentId) ?? pick(r.ai_assignment_id) ?? pick(r.aiAssignment_id);
}

/** Teacher portal `coerceAssignmentBool` plus a few extra truthy strings. */
function coerceAssignmentBool(v: unknown): boolean {
  if (v === true || v === 1) return true;
  if (typeof v === 'string') {
    const t = v.trim().toLowerCase();
    return t === 'true' || t === 'yes' || t === '1';
  }
  return false;
}

function studentHasNumericMarks(r: Record<string, unknown>): boolean {
  const marks = r.marks;
  if (marks == null) return false;
  if (typeof marks === 'string' && !marks.trim()) return false;
  return Number.isFinite(Number(marks));
}

/** Truthy helpers for Firestore student rows — matches teacher portal roster checks. */
export function isStudentSubmitted(s: StudentData[string] | null | undefined): boolean {
  if (!s) return false;
  const r = s as unknown as Record<string, unknown>;
  const submissionFlag = coerceAssignmentBool(r.submission) || coerceAssignmentBool(r.submitted);

  if (!submissionFlag) {
    if (Array.isArray(r.result) && r.result.length > 0) return true;
    if (r.answers && typeof r.answers === 'object' && Object.keys(r.answers as object).length > 0) {
      return true;
    }
    if (typeof r.status === 'string') {
      const t = r.status.trim().toLowerCase();
      if (t === 'submitted' || t === 'graded' || t === 'complete' || t === 'completed') return true;
    }
    return isStudentGraded(s);
  }

  // Teacher portal: empty attachments array means not submitted even if the flag is true.
  if (Array.isArray(r.attachments)) return r.attachments.length > 0;
  if (r.attachments && typeof r.attachments === 'object') {
    return Object.keys(r.attachments as object).length > 0;
  }
  return true;
}

export function isStudentGraded(s: StudentData[string] | null | undefined): boolean {
  if (!s) return false;
  const r = s as unknown as Record<string, unknown>;
  if (coerceAssignmentBool(r.graded)) return true;
  if (typeof r.status === 'string') {
    const t = r.status.trim().toLowerCase();
    if (t === 'graded' || t === 'complete' || t === 'completed') return true;
  }
  // Teacher portal: a finite marks value counts as graded even if `graded` is unset.
  return studentHasNumericMarks(r);
}

function isAiLifecycleCompleteToken(norm: string): boolean {
  return (
    norm === 'completed' ||
    norm === 'complete' ||
    norm === 'done' ||
    norm === 'graded' ||
    norm === 'success' ||
    norm === 'published'
  );
}

/**
 * When true, the AI-graded dashboard maps the row to `pending_evaluation` (“AI assignment created — evaluation incomplete”):
 * {@link pickAiAssignmentStatus} normalizes to `pending` and {@link pickAiAssignmentId} is present (numeric or string id).
 * Higher-priority outcomes still apply first: all submitters graded → `completed`; {@link isAiGradingStatusInProcess} → `in_process`.
 */
export function isPendingAiEvaluationIncomplete(data: Assignment): boolean {
  const id = pickAiAssignmentId(data);
  return (
    normalizeAiStatusToken(pickAiAssignmentStatus(data)) === 'pending' &&
    Boolean(id)
  );
}

/** `PENDING` / `pending` / etc. from {@link pickAiAssignmentStatus}. */
export function isAiAssignmentStatusPending(data: Assignment): boolean {
  return normalizeAiStatusToken(pickAiAssignmentStatus(data)) === 'pending';
}

/** `ACTIVE` / `active` / etc. from {@link pickAiAssignmentStatus}. */
export function isAiAssignmentStatusActive(data: Assignment): boolean {
  return normalizeAiStatusToken(pickAiAssignmentStatus(data)) === 'active';
}

/**
 * True only when assignment is actively in AI grading (canonical value, or same words with different casing/spacing).
 * Comparisons use {@link normalizeAiStatusToken}; any other non-empty value is **not** in-process.
 */
export function isAiGradingStatusInProcess(raw: unknown): boolean {
  const norm = normalizeAiStatusToken(raw);
  if (!norm) return false;
  if (norm === AI_GRADING_STATUS_IN_PROCESS.toLowerCase()) return true;
  const asPhrase = norm.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  return asPhrase === 'ai grading in process' || asPhrase === 'in process' || asPhrase === 'inprogress';
}

/** Dashboard status from AI fields + submission/graded counts. Matches teacher portal Completed / Awaiting. */
export function resolveAIGradingDashboardStatus(
  data: Assignment,
  submittedStudents: number,
  gradedStudents: number
): AIGradingStatus {
  const assignmentNorm = normalizeAiStatusToken(pickAiAssignmentStatus(data));
  const processingNorm = normalizeAiStatusToken(pickAiAssignmentProcessingStatus(data));
  const gradingRun = pickAiGradingStatus(data);

  // Prefer explicit lifecycle completion from AI fields (assignment page COMPLETED badge).
  if (isAiLifecycleCompleteToken(assignmentNorm) || isAiLifecycleCompleteToken(processingNorm)) {
    return 'completed';
  }

  if (submittedStudents > 0 && gradedStudents >= submittedStudents) {
    return 'completed';
  }

  // Teacher portal fallback when roster checks are empty: assignment.grading >= assignment.submissions
  if (
    data.submissionCount != null &&
    data.gradedCount != null &&
    data.submissionCount > 0 &&
    data.gradedCount >= data.submissionCount
  ) {
    return 'completed';
  }

  if (isAiGradingStatusInProcess(gradingRun) || isAiGradingStatusInProcess(data.aiGradingStatus)) {
    return 'in_process';
  }

  if (isPendingAiEvaluationIncomplete(data)) {
    return 'pending_evaluation';
  }

  // PENDING without id still means evaluation was started but incomplete
  if (assignmentNorm === 'pending') {
    return 'pending_evaluation';
  }

  if (assignmentNorm === 'active' || assignmentNorm === 'ready') {
    return 'ready_for_evaluation';
  }

  return 'awaiting';
}

export function isPeerWeeklyTestGradingMode(mode: string | null | undefined): boolean {
  if (mode == null) return false;
  if (typeof mode !== 'string') return false;
  return mode.trim().toLowerCase() === 'peer';
}

/**
 * Reads grading mode from assignment objects (camelCase or snake_case aliases).
 */
export function resolveWeeklyTestGradingMode(data: Assignment): string | undefined {
  const r = data as unknown as Record<string, unknown>;
  return (
    pickNonEmptyString(data.weeklyTestGradingMode) ??
    pickNonEmptyString(r.weekly_test_grading_mode) ??
    pickNonEmptyString(r.weeklyTest_grading_mode) ??
    pickNonEmptyString(r.gradingMode) ??
    pickNonEmptyString(r.grading_mode) ??
    pickNonEmptyString(r.testGradingMode) ??
    pickNonEmptyString(r.aiGradingMode) ??
    pickNonEmptyString(r.ai_grading_mode)
  );
}

/** True when assignment carries AI weekly-test markers even if mode string is missing. */
export function hasAiWeeklyTestSignals(data: Assignment): boolean {
  if (pickAiAssignmentId(data)) return true;
  if (pickAiAssignmentStatus(data)) return true;
  if (pickAiAssignmentProcessingStatus(data)) return true;
  if (pickAiGradingStatus(data)) return true;
  const r = data as unknown as Record<string, unknown>;
  if (r.aiGraded === true || r.isAiGraded === true || r.useAiGrading === true) return true;
  return false;
}

/** Explicit `"ai"` (case-insensitive) or common aliases used by teacher apps. */
export function isExplicitAiWeeklyTestGradingMode(mode: string | null | undefined): boolean {
  if (typeof mode !== 'string') return false;
  const normalized = mode.trim().toLowerCase().replace(/[\s_-]+/g, '');
  return (
    normalized === 'ai' ||
    normalized === 'aigrading' ||
    normalized === 'aigraded' ||
    normalized === 'artificialintelligence'
  );
}

export function isAiWeeklyTestAssignment(data: Assignment): boolean {
  if (isExplicitAiWeeklyTestGradingMode(resolveWeeklyTestGradingMode(data))) return true;
  // Peer mode must never be treated as AI even if stray AI fields exist
  if (isPeerWeeklyTestGradingMode(resolveWeeklyTestGradingMode(data))) return false;
  return hasAiWeeklyTestSignals(data);
}

/** Dashboard bucket for an AI-mode assignment (deadline passed). */
export type AIGradingStatus =
  | 'awaiting'
  | 'pending_evaluation'
  | 'ready_for_evaluation'
  | 'in_process'
  | 'completed';

export interface AIGradedAssignmentItem {
  topicId: string;
  topicName: string;
  courseId: string | number | null;
  courseName: string | null;
  assignment: { id: string; data: Assignment; archivedFirestoreDocId?: string };
  totalStudents: number;
  submittedStudents: number;
  gradedStudents: number;
  status: AIGradingStatus;
}

const AI_GRADED_ARCHIVE_LOOKBACK_DAYS = 90;

const AI_DASHBOARD_CATEGORIES = [
  'WeeklyTest',
  'WeeklyTest preparation',
  'PastPaper Practice',
  'PastPaperPractice',
] as const;

function resolveTopicIdFromAssignmentRaw(
  raw: Record<string, unknown>,
  topics: { [key: string]: { course: any; name?: string } }
): string {
  const candidates = [raw.topicId, raw.topic, raw.topicName, raw.topic_id]
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean);

  for (const c of candidates) {
    if (topics[c]) return c;
  }
  for (const c of candidates) {
    for (const [id, meta] of Object.entries(topics)) {
      if (meta?.name === c) return id;
    }
  }
  return candidates[0] || 'unknown';
}

function sortAIGradedItems(items: AIGradedAssignmentItem[]): AIGradedAssignmentItem[] {
  return [...items].sort((a, b) => {
    const da = a.assignment.data.deadline ? new Date(a.assignment.data.deadline).getTime() : 0;
    const db = b.assignment.data.deadline ? new Date(b.assignment.data.deadline).getTime() : 0;
    return db - da;
  });
}

function buildAIGradedRow(params: {
  topicId: string;
  topicName: string;
  courseId: string | number | null;
  courseName: string | null;
  assignment: { id: string; data: Assignment; archivedFirestoreDocId?: string };
  totalStudents?: number;
  submittedStudents?: number;
  gradedStudents?: number;
}): AIGradedAssignmentItem {
  const submittedStudents = params.submittedStudents ?? 0;
  const gradedStudents = params.gradedStudents ?? 0;
  return {
    topicId: params.topicId,
    topicName: params.topicName,
    courseId: params.courseId,
    courseName: params.courseName,
    assignment: params.assignment,
    totalStudents: params.totalStudents ?? 0,
    submittedStudents,
    gradedStudents,
    status: resolveAIGradingDashboardStatus(
      params.assignment.data,
      submittedStudents,
      gradedStudents
    ),
  };
}

/** Collection-level live Assignments query (few queries total, not per-topic). */
async function fetchAllLiveAssignmentsForAIDashboard(): Promise<
  { id: string; data: Assignment; raw: Record<string, unknown> }[]
> {
  const col = collection(firestore, ASSIGNMENTS_COL);
  const queries = [
    query(col, where('selectedAssignmentCategory', 'in', [...AI_DASHBOARD_CATEGORIES])),
  ];
  const snapshots = await getDocsAllSettled(queries);

  if (snapshots.length === 0) {
    throw new Error('All collection-level Assignments queries failed');
  }

  const byId = new Map<string, { id: string; data: Assignment; raw: Record<string, unknown> }>();
  for (const snap of snapshots) {
    snap.forEach((docSnap) => {
      const raw = docSnap.data() as Record<string, unknown>;
      if (isAssignmentArchived(raw)) return;
      const data = firestoreAssignmentDocToAssignment(raw);
      if (!data.title?.trim()) return;
      byId.set(docSnap.id, { id: docSnap.id, data, raw });
    });
  }
  return Array.from(byId.values());
}

/** Collection-level archived weekly tests in lookback window. */
async function fetchAllArchivedWeeklyTestsForAIDashboard(): Promise<
  { item: WeeklyTestListItem; raw: Record<string, unknown> }[]
> {
  const to = new Date();
  const from = new Date(Date.now() - AI_GRADED_ARCHIVE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const col = collection(firestore, 'Archived-Assignments');
  const snapshots = await getDocsAllSettled([
    query(
      col,
      where('selectedAssignmentCategory', '==', WEEKLY_TEST_CATEGORY),
      where('creationDate', '>=', Timestamp.fromDate(from)),
      where('creationDate', '<=', Timestamp.fromDate(to))
    ),
  ]);

  const byId = new Map<string, { item: WeeklyTestListItem; raw: Record<string, unknown> }>();
  const range = { from, to };
  for (const snap of snapshots) {
    snap.forEach((docSnap) => {
      const raw = docSnap.data() as Record<string, unknown>;
      const data = archivedFirestoreDocToAssignment(docSnap.id, raw);
      if (!data.title?.trim()) return;
      const refDate = getArchivedDocReferenceDate(raw, data);
      if (!refDate || refDate < range.from || refDate > range.to) return;
      byId.set(docSnap.id, {
        raw,
        item: {
          id: docSnap.id,
          data,
          firestoreDocId: docSnap.id,
          archivedFirestoreDocId: docSnap.id,
        },
      });
    });
  }
  return Array.from(byId.values());
}

/**
 * Eligible when:
 * 1) Category is WeeklyTest (or prep) / Past Paper Practice
 * 2) Grading mode is AI, or AI lifecycle fields are present (and not peer)
 * Deadline is optional — upcoming AI weekly tests still appear as `awaiting`.
 */
export function isAIGradedEligible(data: Assignment, _now: Date = new Date()): boolean {
  if (!isWeeklyTestOrPastPaperCategory(data.selectedAssignmentCategory)) return false;
  if (!isAiWeeklyTestAssignment(data)) return false;
  return true;
}

/** Fast path for one topic (used by tooling); prefer {@link fetchAllAIGradedAssignmentsAcrossTopics}. */
export const fetchAIGradedAssignmentsForTopic = async (
  topicId: string,
  topicMeta?: { course?: { id?: string | number; name?: string } | null; name?: string }
): Promise<AIGradedAssignmentItem[]> => {
  const now = new Date();
  const topicName = topicMeta?.name || topicId;
  const courseId = topicMeta?.course?.id ?? null;
  const courseName = topicMeta?.course?.name ?? null;

  const [live, archived] = await Promise.all([
    fetchAssignmentsFromFirestoreForTopic(topicId, topicName),
    fetchArchivedWeeklyTestDocsForTopic(
      topicId,
      {
        from: new Date(Date.now() - AI_GRADED_ARCHIVE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000),
        to: now,
      },
      topicName
    ).catch((error) => {
      console.error(`Error loading archived AI assignments for ${topicId}:`, error);
      return [] as WeeklyTestListItem[];
    }),
  ]);

  const byTitle = new Map<string, { id: string; data: Assignment; archivedFirestoreDocId?: string }>();
  for (const a of live) {
    if (!isAIGradedEligible(a.data, now)) continue;
    const key = a.data.title.trim().toLowerCase();
    if (!key) continue;
    byTitle.set(key, a);
  }
  for (const a of archived) {
    if (!isAIGradedEligible(a.data, now)) continue;
    const key = a.data.title.trim().toLowerCase();
    if (!key || byTitle.has(key)) continue;
    byTitle.set(key, {
      id: a.id,
      data: a.data,
      archivedFirestoreDocId: a.archivedFirestoreDocId,
    });
  }

  // Status from AI fields only — no per-assignment student reads (those are enriched later).
  return sortAIGradedItems(
    Array.from(byTitle.values()).map((a) =>
      buildAIGradedRow({
        topicId,
        topicName,
        courseId,
        courseName,
        assignment: a,
      })
    )
  );
};

export type AIGradedAssignmentsDashboardPayload = {
  items: AIGradedAssignmentItem[];
  topics: { [key: string]: { course: any; name?: string } };
  /** Topics whose fetch failed entirely — UI should keep previous rows for these. */
  failedTopicIds: string[];
};

/**
 * Fast dashboard load: a few collection queries (not N topics × students).
 * Student counts are filled later via {@link enrichAIGradedItemsWithSubmissionCounts}.
 */
export const fetchAllAIGradedAssignmentsAcrossTopics =
  async (): Promise<AIGradedAssignmentsDashboardPayload> => {
    const now = new Date();
    const topics = await fetchTopics();

    let liveDocs: { id: string; data: Assignment; raw: Record<string, unknown> }[] = [];
    let archivedDocs: { item: WeeklyTestListItem; raw: Record<string, unknown> }[] = [];
    let usedFallback = false;

    try {
      const [live, archived] = await Promise.all([
        fetchAllLiveAssignmentsForAIDashboard(),
        fetchAllArchivedWeeklyTestsForAIDashboard(),
      ]);
      liveDocs = live;
      archivedDocs = archived;
    } catch (error) {
      console.error('Collection AI dashboard queries failed, falling back per-topic:', error);
      usedFallback = true;
    }

    // Fallback only when the fast collection query fails (not when results are legitimately empty).
    if (usedFallback) {
      const topicIds = Object.keys(topics);
      const failedTopicIds: string[] = [];
      const merged: AIGradedAssignmentItem[] = [];
      const concurrency = 12;
      for (let i = 0; i < topicIds.length; i += concurrency) {
        const slice = topicIds.slice(i, i + concurrency);
        const part = await Promise.all(
          slice.map(async (topicId) => {
            try {
              return {
                topicId,
                items: await fetchAIGradedAssignmentsForTopic(topicId, topics[topicId]),
                ok: true as const,
              };
            } catch (error) {
              console.error(`Fallback topic load failed for ${topicId}:`, error);
              return { topicId, items: [] as AIGradedAssignmentItem[], ok: false as const };
            }
          })
        );
        for (const row of part) {
          if (!row.ok) failedTopicIds.push(row.topicId);
          else merged.push(...row.items);
        }
      }
      return {
        items: sortAIGradedItems(merged),
        topics,
        failedTopicIds,
      };
    }

    const byKey = new Map<string, AIGradedAssignmentItem>();

    for (const doc of liveDocs) {
      if (!isAIGradedEligible(doc.data, now)) continue;
      const topicId = resolveTopicIdFromAssignmentRaw(doc.raw, topics);
      const topicMeta = topics[topicId];
      const topicName = topicMeta?.name || topicId;
      const titleKey = doc.data.title.trim().toLowerCase();
      const mapKey = `${topicId}::${titleKey}`;
      byKey.set(
        mapKey,
        buildAIGradedRow({
          topicId,
          topicName,
          courseId: topicMeta?.course?.id ?? null,
          courseName: topicMeta?.course?.name ?? null,
          assignment: { id: doc.id, data: doc.data },
        })
      );
    }

    for (const entry of archivedDocs) {
      const a = entry.item;
      if (!isAIGradedEligible(a.data, now)) continue;
      const topicId = resolveTopicIdFromAssignmentRaw(entry.raw, topics);
      const topicMeta = topics[topicId];
      const topicName = topicMeta?.name || topicId;
      const titleKey = a.data.title.trim().toLowerCase();
      const mapKey = `${topicId}::${titleKey}`;
      if (byKey.has(mapKey)) continue;
      byKey.set(
        mapKey,
        buildAIGradedRow({
          topicId,
          topicName,
          courseId: topicMeta?.course?.id ?? null,
          courseName: topicMeta?.course?.name ?? null,
          assignment: {
            id: a.id,
            data: a.data,
            archivedFirestoreDocId: a.archivedFirestoreDocId,
          },
        })
      );
    }

    return {
      items: sortAIGradedItems(Array.from(byKey.values())),
      topics,
      failedTopicIds: [],
    };
  };

const ENRICH_SUBMISSION_CONCURRENCY = 10;

/**
 * Backfill submission/graded counts (and status) without blocking the initial list render.
 * Calls `onBatch` with updated rows as each batch completes.
 */
export async function enrichAIGradedItemsWithSubmissionCounts(
  items: AIGradedAssignmentItem[],
  onBatch?: (updated: AIGradedAssignmentItem[]) => void,
  shouldContinue?: () => boolean
): Promise<AIGradedAssignmentItem[]> {
  if (items.length === 0) return items;

  const out = items.map((item) => ({ ...item }));
  const indexByKey = new Map<string, number>(
    out.map((item, index) => [`${item.topicId}::${item.assignment.data.title}`, index])
  );

  for (let i = 0; i < out.length; i += ENRICH_SUBMISSION_CONCURRENCY) {
    if (shouldContinue && !shouldContinue()) return out;
    const slice = out.slice(i, i + ENRICH_SUBMISSION_CONCURRENCY);
    await Promise.all(
      slice.map(async (item) => {
        const key = `${item.topicId}::${item.assignment.data.title}`;
        const idx = indexByKey.get(key);
        if (idx == null) return;

        let totalStudents = 0;
        let submittedStudents = 0;
        let gradedStudents = 0;
        try {
          const studentData = item.assignment.archivedFirestoreDocId
            ? await fetchWeeklyTestStudentSubmissions(
                item.topicId,
                item.assignment.data.title,
                item.assignment.archivedFirestoreDocId
              )
            : await fetchStudentSubmissions(
                item.topicId,
                item.assignment.data.title,
                item.topicName
              );
          totalStudents = Object.keys(studentData).length;
          Object.values(studentData).forEach((s) => {
            if (isStudentSubmitted(s)) {
              submittedStudents++;
              if (isStudentGraded(s)) gradedStudents++;
            }
          });
        } catch (error) {
          console.error(
            `Enrich submissions failed for ${item.topicId} / ${item.assignment.data.title}:`,
            error
          );
        }

        out[idx] = buildAIGradedRow({
          topicId: item.topicId,
          topicName: item.topicName,
          courseId: item.courseId,
          courseName: item.courseName,
          assignment: item.assignment,
          totalStudents,
          submittedStudents,
          gradedStudents,
        });
      })
    );

    onBatch?.(out.map((row) => ({ ...row })));
  }

  return out;
}

// Fetch classes from Firestore
export const fetchClassesFromFirestore = async (
  topic: string,
  fromDate: Date,
  toDate: Date
): Promise<any[]> => {
  try {
    const classesRef = collection(firestore, 'Classes');
    const fromTimestamp = Timestamp.fromDate(fromDate);
    const toTimestamp = Timestamp.fromDate(toDate);
    
    const q = query(
      classesRef,
      where('topic', '==', topic),
      where('creationDate', '>=', fromTimestamp),
      where('creationDate', '<=', toTimestamp),
      orderBy('creationDate', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    const classes: any[] = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      classes.push({
        id: doc.id,
        ...data,
        creationDate: data.creationDate?.toDate() || null
      });
    });
    
    return classes;
  } catch (error) {
    return [];
  }
};

// Fetch assignment student data from Firestore AssignmentStudents/students
export const fetchAssignmentStudentData = async (
  topic: string,
  assignmentTitle: string,
  studentId: string,
  studentName?: string
): Promise<StudentData[string] | null> => {
  try {
    const assignmentDocId = buildAssignmentDocId(topic, assignmentTitle);
    const tryIds = [String(studentId ?? '')].filter(Boolean);
    if (studentName && String(studentName) !== String(studentId)) {
      tryIds.push(String(studentName));
    }

    for (const id of tryIds) {
      const studentRef = doc(
        firestore,
        ASSIGNMENT_STUDENTS_COL,
        assignmentDocId,
        'students',
        encodeStudentNameForFirestore(id)
      );
      const snapshot = await getDoc(studentRef);
      if (snapshot.exists()) {
        return snapshot.data() as StudentData[string];
      }
    }

    return null;
  } catch (error) {
    return null;
  }
};

/**
 * Topics a student is enrolled in. Shallow topic keys + per-path exists checks
 * (never full /topics download; no topicMeta/studentTopics indexes).
 */
export const fetchStudentTopics = async (studentName: string): Promise<string[]> => {
  try {
    if (!studentName) return [];

    const topicIds = await listTopicKeysLight();
    if (!topicIds.length) return [];

    const batchSize = 20;
    const studentTopics: string[] = [];

    for (let i = 0; i < topicIds.length; i += batchSize) {
      const batch = topicIds.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (topicId) => {
          try {
            const studentSnapshot = await get(
              ref(database, `topics/${topicId}/students/${studentName}`)
            );
            return studentSnapshot.exists() ? topicId : null;
          } catch {
            return null;
          }
        })
      );
      studentTopics.push(...batchResults.filter((id): id is string => id !== null));
    }

    return studentTopics;
  } catch (error) {
    return [];
  }
};
