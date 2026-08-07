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

/** Firestore doc id: `{topic}__{encodeURIComponent(title)}` */
export function buildAssignmentDocId(topic: string, title: string): string {
  return `${topic}__${encodeURIComponent(title)}`;
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
  if (!ref) return false;
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
  // RTDB / JSON Firestore-style map: { seconds, nanoseconds? }
  if (typeof raw === 'object' && raw !== null && 'seconds' in raw) {
    const sec = (raw as { seconds: unknown }).seconds;
    if (typeof sec === 'number' && Number.isFinite(sec)) {
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
  const aiId = pickAiAssignmentId(withAliases);
  if (aiId) base.aiAssignmentId = aiId;
  if (typeof raw.aiGradingStatus === 'string' && raw.aiGradingStatus.trim()) {
    base.aiGradingStatus = raw.aiGradingStatus;
  }

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
  topic: string
): Promise<{ id: string; data: Assignment }[]> {
  const col = collection(firestore, ASSIGNMENTS_COL);
  const snapshots = await Promise.all([
    getDocs(query(col, where('topic', '==', topic))),
    getDocs(query(col, where('topicId', '==', topic))),
  ]);

  const byId = new Map<string, { id: string; data: Assignment }>();
  for (const snap of snapshots) {
    snap.forEach((docSnap) => {
      const raw = docSnap.data() as Record<string, unknown>;
      if (isAssignmentArchived(raw)) return;
      const data = firestoreAssignmentDocToAssignment(raw);
      byId.set(docSnap.id, { id: docSnap.id, data });
    });
  }
  return Array.from(byId.values());
}

async function fetchAssignmentStudentsFromFirestore(
  topic: string,
  assignmentTitle: string
): Promise<StudentData> {
  const assignmentDocId = buildAssignmentDocId(topic, assignmentTitle);
  const studentsCol = collection(
    firestore,
    ASSIGNMENT_STUDENTS_COL,
    assignmentDocId,
    'students'
  );
  const snapshot = await getDocs(studentsCol);
  if (snapshot.empty) return {};

  const merged: StudentData = {};
  snapshot.forEach((docSnap) => {
    const name = decodeStudentNameFromFirestore(docSnap.id);
    merged[name] = docSnap.data() as StudentData[string];
  });
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
  dateWindow?: AssignmentDateWindow
): Promise<WeeklyTestListItem[]> {
  const range = dateWindow ?? {
    from: getWeeklyTestCutoffDate(),
    to: new Date(),
  };
  const creationDateFrom = Timestamp.fromDate(range.from);
  const creationDateTo = Timestamp.fromDate(range.to);

  const col = collection(firestore, 'Archived-Assignments');

  const snapshots = await Promise.all([
    getDocs(
      query(
        col,
        where('topic', '==', topic),
        where('selectedAssignmentCategory', '==', WEEKLY_TEST_CATEGORY),
        where('creationDate', '>=', creationDateFrom),
        where('creationDate', '<=', creationDateTo)
      )
    ),
    getDocs(
      query(
        col,
        where('topicId', '==', topic),
        where('selectedAssignmentCategory', '==', WEEKLY_TEST_CATEGORY),
        where('creationDate', '>=', creationDateFrom),
        where('creationDate', '<=', creationDateTo)
      )
    ),
  ]);
  const byId = new Map<string, WeeklyTestListItem>();

  for (const snap of snapshots) {
    snap.forEach((docSnap) => {
      const raw = docSnap.data() as Record<string, unknown>;

      const data = archivedFirestoreDocToAssignment(docSnap.id, raw);
      const refDate = getArchivedDocReferenceDate(raw, data);
      if (!refDate || refDate < range.from || refDate > range.to) return;

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
  dateWindow?: AssignmentDateWindow
): Promise<WeeklyTestListItem[]> {
  const range = dateWindow ?? {
    from: getWeeklyTestCutoffDate(),
    to: new Date(),
  };
  const assignments = await fetchLiveAssignmentsFromFirestore(topic);
  const out: WeeklyTestListItem[] = [];

  for (const { id, data } of assignments) {
    if (data.selectedAssignmentCategory !== 'WeeklyTest') continue;
    if (!isAssignmentInDateWindow(data, range)) continue;
    out.push({ id, data, firestoreDocId: id });
  }
  return out;
}

/**
 * Weekly tests for admin UI: Firestore live assignments + archived docs, deduped by title.
 */
export async function fetchWeeklyTestsForTopic(
  topic: string,
  dateWindow?: AssignmentDateWindow
): Promise<WeeklyTestListItem[]> {
  const range = dateWindow ?? {
    from: getWeeklyTestCutoffDate(),
    to: new Date(),
  };
  const live = await fetchWeeklyTestsFromFirestore(topic, range);
  const archived = await fetchArchivedWeeklyTestDocsForTopic(topic, range);

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
 * never downloads the full /topics tree.
 */
export const fetchTopics = async (): Promise<{[key: string]: TopicListEntry}> => {
  try {
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
    return topicsWithCourses;
  } catch (error) {
    return {};
  }
};

/** Weekly tests only: Firestore Assignments + Archived-Assignments, filtered by `dateWindow`. */
export const fetchAssignments = async (
  topic: string,
  dateWindow?: AssignmentDateWindow
): Promise<WeeklyTestListItem[]> => {
  return fetchWeeklyTestsForTopic(topic, dateWindow);
};

export const fetchStudentSubmissions = async (
  topic: string,
  assignmentTitle: string
): Promise<StudentData> => {
  return fetchAssignmentStudentsFromFirestore(topic, assignmentTitle);
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
 */
export const fetchAssignmentsFromFirestoreForTopic = async (
  topic: string
): Promise<{ id: string; data: Assignment }[]> => {
  try {
    return await fetchLiveAssignmentsFromFirestore(topic);
  } catch (error) {
    return [];
  }
};

/** All assignment types for a topic — Firestore `Assignments` collection. */
export const fetchAllAssignments = fetchAssignmentsFromFirestoreForTopic;

export const PAST_PAPER_PRACTICE_CATEGORIES = ['PastPaper Practice', 'PastPaperPractice'] as const;

export function isPastPaperPracticeCategory(category: string | undefined): boolean {
  if (!category) return false;
  return (PAST_PAPER_PRACTICE_CATEGORIES as readonly string[]).includes(category);
}

export function isWeeklyTestOrPastPaperCategory(category: string | undefined): boolean {
  if (!category) return false;
  return (
    category === WEEKLY_TEST_CATEGORY ||
    category === 'WeeklyTest preparation' ||
    isPastPaperPracticeCategory(category)
  );
}

export const AI_GRADING_STATUS_IN_PROCESS = 'AI_GRADING_STATUS_IN_PROCESS' as const;

/** Lowercase trimmed string for stable comparisons (`''` if missing / not a string). */
export function normalizeAiStatusToken(raw: unknown): string {
  if (raw == null || typeof raw !== 'string') return '';
  return raw.trim().toLowerCase();
}

/**
 * Reads `aiAssignmentStatus` from assignment objects (camelCase or snake_case aliases).
 */
export function pickAiAssignmentStatus(data: Assignment): string | undefined {
  const r = data as unknown as Record<string, unknown>;
  const pick = (v: unknown): string | undefined => {
    if (v == null) return undefined;
    if (typeof v === 'string') {
      const t = v.trim();
      return t === '' ? undefined : t;
    }
    return undefined;
  };
  return (
    pick(data.aiAssignmentStatus) ??
    pick(r.ai_assignment_status) ??
    pick(r.aiAssignment_status)
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
  return asPhrase === 'ai grading in process';
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
  const pick = (v: unknown): string | undefined => {
    if (v == null) return undefined;
    if (typeof v === 'string') {
      const t = v.trim();
      return t === '' ? undefined : t;
    }
    return undefined;
  };
  return (
    pick(data.weeklyTestGradingMode) ??
    pick(r.weekly_test_grading_mode) ??
    pick(r.weeklyTest_grading_mode) ??
    pick(r.gradingMode) ??
    pick(r.grading_mode)
  );
}

/** Only explicit `"ai"` (case-insensitive, trimmed). Null/undefined/other modes → false. */
export function isExplicitAiWeeklyTestGradingMode(mode: string | null | undefined): boolean {
  if (typeof mode !== 'string') return false;
  return mode.trim().toLowerCase() === 'ai';
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
  assignment: { id: string; data: Assignment };
  totalStudents: number;
  submittedStudents: number;
  gradedStudents: number;
  status: AIGradingStatus;
}

/**
 * Eligible only when all hold:
 * 1) Category is WeeklyTest or Past Paper Practice (`PastPaper Practice` or legacy `PastPaperPractice`).
 * 2) Grading mode resolves to explicit `"ai"` (see `resolveWeeklyTestGradingMode` for field aliases).
 * 3) Submission deadline has passed (supports ISO string, ms number, Firestore-like `{seconds}` maps).
 */
export function isAIGradedEligible(data: Assignment, now: Date = new Date()): boolean {
  if (!isWeeklyTestOrPastPaperCategory(data.selectedAssignmentCategory)) return false;

  if (!isExplicitAiWeeklyTestGradingMode(resolveWeeklyTestGradingMode(data))) return false;

  const r = data as unknown as Record<string, unknown>;
  const deadlineAt =
    coerceFirestoreTimestampLike(data.deadline ?? r.deadline) ??
    coerceFirestoreTimestampLike(r.submissionDeadline);
  if (!deadlineAt) return false;
  if (deadlineAt.getTime() > now.getTime()) return false;

  return true;
}

export const fetchAIGradedAssignmentsForTopic = async (
  topicId: string,
  topicMeta?: { course?: { id?: string | number; name?: string } | null; name?: string }
): Promise<AIGradedAssignmentItem[]> => {
  const now = new Date();
  const topicName = topicMeta?.name || topicId;
  const courseId = topicMeta?.course?.id ?? null;
  const courseName = topicMeta?.course?.name ?? null;

  const assignments = await fetchAssignmentsFromFirestoreForTopic(topicId);

  const eligible = assignments.filter((a) => isAIGradedEligible(a.data, now));

  const enriched: AIGradedAssignmentItem[] = [];
  const batchSize = 12;
  for (let i = 0; i < eligible.length; i += batchSize) {
    const batch = eligible.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (a) => {
        try {
          const studentData = await fetchStudentSubmissions(topicId, a.data.title);
          const totalStudents = Object.keys(studentData).length;
          let submittedStudents = 0;
          let gradedStudents = 0;
          Object.values(studentData).forEach((s) => {
            if (s?.submission) {
              submittedStudents++;
              if (s.graded) gradedStudents++;
            }
          });

          const assignmentNorm = normalizeAiStatusToken(pickAiAssignmentStatus(a.data));

          let status: AIGradingStatus;
          if (submittedStudents > 0 && gradedStudents === submittedStudents) {
            status = 'completed';
          } else if (isAiGradingStatusInProcess(a.data.aiGradingStatus)) {
            status = 'in_process';
          } else if (isPendingAiEvaluationIncomplete(a.data)) {
            status = 'pending_evaluation';
          } else if (assignmentNorm === 'active') {
            status = 'ready_for_evaluation';
          } else {
            status = 'awaiting';
          }

          const row: AIGradedAssignmentItem = {
            topicId,
            topicName,
            courseId,
            courseName,
            assignment: a,
            totalStudents,
            submittedStudents,
            gradedStudents,
            status,
          };
          return row;
        } catch (error) {
          return null;
        }
      })
    );
    for (const r of results) {
      if (r !== null) enriched.push(r);
    }
  }

  enriched.sort((a, b) => {
    const da = a.assignment.data.deadline ? new Date(a.assignment.data.deadline).getTime() : 0;
    const db = b.assignment.data.deadline ? new Date(b.assignment.data.deadline).getTime() : 0;
    return db - da;
  });

  return enriched;
};

const AI_GRADED_TOPICS_FETCH_CONCURRENCY = 4;

export type AIGradedAssignmentsDashboardPayload = {
  items: AIGradedAssignmentItem[];
  topics: { [key: string]: { course: any; name?: string } };
};

/** Loads AI-graded assignment rows for every topic (merged, deadline-sorted). Includes awaiting / in process / completed. */
export const fetchAllAIGradedAssignmentsAcrossTopics =
  async (): Promise<AIGradedAssignmentsDashboardPayload> => {
    const topics = await fetchTopics();
    const topicIds = Object.keys(topics);
    const merged: AIGradedAssignmentItem[] = [];

    for (let i = 0; i < topicIds.length; i += AI_GRADED_TOPICS_FETCH_CONCURRENCY) {
      const slice = topicIds.slice(i, i + AI_GRADED_TOPICS_FETCH_CONCURRENCY);
      const part = await Promise.all(
        slice.map((topicId) => fetchAIGradedAssignmentsForTopic(topicId, topics[topicId]))
      );
      merged.push(...part.flat());
    }

    merged.sort((a, b) => {
      const da = a.assignment.data.deadline ? new Date(a.assignment.data.deadline).getTime() : 0;
      const db = b.assignment.data.deadline ? new Date(b.assignment.data.deadline).getTime() : 0;
      return db - da;
    });

    return { items: merged, topics };
  };

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
