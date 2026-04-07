import { ref, get, update } from 'firebase/database';
import { collection, query, where, getDocs, Timestamp, orderBy } from 'firebase/firestore';
import { database, firestore } from '../config/firebase';
import { Assignment, StudentData, WeeklyTestListItem } from '../types';

/** Rolling window for weekly test lists (Realtime + Firestore archive). 45 days for faster loads. */
export const WEEKLY_TEST_LOOKBACK_DAYS = 45;
export const WEEKLY_TEST_LOOKBACK_MS = WEEKLY_TEST_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

export function getWeeklyTestCutoffDate(): Date {
  return new Date(Date.now() - WEEKLY_TEST_LOOKBACK_MS);
}

/** Default `<input type="date">` range for Teacher Grading Report — matches weekly-test lookback. */
export function getTeacherReportDefaultDateRange(): { startDate: string; endDate: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const toYmd = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const end = new Date();
  const start = new Date(Date.now() - WEEKLY_TEST_LOOKBACK_MS);
  return { startDate: toYmd(start), endDate: toYmd(end) };
}

/** Inclusive date range for weekly-test queries (Realtime + Firestore). */
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
  return null;
}

function archivedFirestoreDocToAssignment(
  _docId: string,
  raw: Record<string, unknown>
): Assignment {
  const deadlineD = coerceFirestoreTimestampLike(raw.deadline);
  const gradingD = coerceFirestoreTimestampLike(raw.gradingDeadline);
  let creationDate: number | undefined;
  const cRaw = raw.creationDate;
  if (typeof cRaw === 'number') creationDate = cRaw;
  else if (cRaw instanceof Timestamp) creationDate = cRaw.toMillis();
  else if (cRaw && typeof cRaw === 'object' && 'toMillis' in cRaw && typeof (cRaw as { toMillis: () => number }).toMillis === 'function') {
    creationDate = (cRaw as { toMillis: () => number }).toMillis();
  }

  return {
    title: String(raw.title ?? raw.assignmentTitle ?? ''),
    deadline: deadlineD ? deadlineD.toISOString() : String(raw.deadline ?? ''),
    gradingDeadline: gradingD ? gradingD.toISOString() : String(raw.gradingDeadline ?? ''),
    totalMarks: String(raw.totalMarks ?? ''),
    weightage: Number(raw.weightage ?? 0),
    selectedAssignmentCategory: String(raw.selectedAssignmentCategory ?? 'WeeklyTest'),
    teacherName: String(raw.teacherName ?? ''),
    creationDate,
  };
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
        archivedFirestoreDocId: docSnap.id,
      });
    });
  }

  return Array.from(byId.values());
}

/**
 * Active weekly tests only (Realtime DB), filtered by the same date window as Firestore archive.
 * Used for pending/unmarked queues where grading must stay on RTDB paths.
 */
export async function fetchWeeklyTestsFromRealtimeOnly(
  topic: string,
  dateWindow?: AssignmentDateWindow
): Promise<WeeklyTestListItem[]> {
  const range = dateWindow ?? {
    from: getWeeklyTestCutoffDate(),
    to: new Date(),
  };
  const assignmentRef = ref(database, `assignments/topics/${topic}/assignment`);
  const snapshot = await get(assignmentRef);
  if (!snapshot.exists()) return [];

  const assignments = snapshot.val() as Record<string, Assignment>;
  const out: WeeklyTestListItem[] = [];

  for (const [id, data] of Object.entries(assignments)) {
    if (data.selectedAssignmentCategory !== 'WeeklyTest') continue;
    if (!isAssignmentInDateWindow(data, range)) continue;
    out.push({ id, data });
  }
  return out;
}

/**
 * Weekly tests for admin UI: Realtime DB first, then Firestore archive (both use the same date window), deduped by title.
 */
export async function fetchWeeklyTestsForTopic(
  topic: string,
  dateWindow?: AssignmentDateWindow
): Promise<WeeklyTestListItem[]> {
  const range = dateWindow ?? {
    from: getWeeklyTestCutoffDate(),
    to: new Date(),
  };
  const live = await fetchWeeklyTestsFromRealtimeOnly(topic, range);
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

export const fetchTopics = async (): Promise<{[key: string]: {course: any, name?: string}}> => {
  try {
    const assignmentsRef = ref(database, 'topics');
    
    // Get snapshot to access keys and course objects only
    const snapshot = await get(assignmentsRef);

    if (snapshot.exists()) {
      const data = snapshot.val();
      
      // Extract keys, course objects, and topic names for each topic
      const topicsWithCourses: {[key: string]: {course: any, name?: string}} = {};
      
      Object.keys(data).forEach(topicKey => {
        const topicData = data[topicKey];
        topicsWithCourses[topicKey] = {
          course: topicData.course || null,
          name: topicData.name || topicKey
        };
      });
      
      return topicsWithCourses;
    } else {
      console.log('No data found at topics path');
      return {};
    }
  } catch (error) {
    console.error('Error fetching topics from Firebase:', error);
    return {};
  }
};

/** Weekly tests only: Realtime DB + Firestore Archived-Assignments, filtered by `dateWindow` (default: last ~45 days). */
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
  const studentsRef = ref(database, `assignmentStudents/${topic}/${assignmentTitle}/students`);
  const snapshot = await get(studentsRef);

  if (snapshot.exists()) {
    return snapshot.val() as StudentData;
  }
  return {};
};

/**
 * Student submissions for a weekly test: RTDB, or merged chunks from Archived-Assignments-Students.
 */
export async function fetchWeeklyTestStudentSubmissions(
  topic: string,
  assignmentTitle: string,
  archivedFirestoreDocId?: string
): Promise<StudentData> {
  if (!archivedFirestoreDocId) {
    return fetchStudentSubmissions(topic, assignmentTitle);
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
  const studentRef = ref(
    database,
    `assignmentStudents/${topic}/${assignmentTitle}/students/${studentName}`
  );

  await update(studentRef, {
    graded: true,
    marks,
    feedback,
  });
};

// Generic update function for any Firebase path
export const updateFirebaseData = async (
  path: string,
  data: any
): Promise<void> => {
  const refPath = ref(database, path);
  await update(refPath, data);
};

// Specific function for updating supervision approval
export const updateSupervisionApproval = async (
  topic: string,
  assignmentTitle: string,
  studentName: string,
  approvalValue: string | null
): Promise<void> => {
  const path = `assignmentStudents/${topic}/${assignmentTitle}/students/${studentName}`;
  
  if (!approvalValue) {
    // Remove approval
    await updateFirebaseData(path, {
      supervisionApproval: null,
      supervisionApprovalDate: null
    });
  } else {
    // Update approval
    await updateFirebaseData(path, {
      supervisionApproval: approvalValue,
      supervisionApprovalDate: new Date().getTime()
    });
  }
};

// Fetch all students from database
export const fetchAllStudents = async (): Promise<Array<{name: string, studentId: string}>> => {
  try {
    const studentsRef = ref(database, 'students');
    const snapshot = await get(studentsRef);
    
    if (snapshot.exists()) {
      const data = snapshot.val();
      const studentsList: Array<{name: string, studentId: string}> = [];
      
      Object.keys(data).forEach(studentName => {
        const studentData = data[studentName];
        studentsList.push({
          name: studentName,
          studentId: studentData.studentId || studentData.id || ''
        });
      });
      
      // Sort by name
      studentsList.sort((a, b) => a.name.localeCompare(b.name));
      return studentsList;
    }
    return [];
  } catch (error) {
    console.error('Error fetching students:', error);
    return [];
  }
};

// Fetch all assignments (not just WeeklyTest)
export const fetchAllAssignments = async (topic: string): Promise<{ id: string; data: Assignment }[]> => {
  try {
    const assignmentRef = ref(database, `assignments/topics/${topic}/assignment`);
    const snapshot = await get(assignmentRef);
    
    if (snapshot.exists()) {
      const assignments = snapshot.val();
      const allAssignments = Object.entries(assignments)
        .map(([id, data]) => {
          return { id, data: data as Assignment };
        });
      
      return allAssignments;
    }
    return [];
  } catch (error) {
    console.error('Error fetching all assignments:', error);
    return [];
  }
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
    console.error('Error fetching classes from Firestore:', error);
    return [];
  }
};

// Fetch assignment student data from assignmentStudents path
// Tries both studentId and studentName
export const fetchAssignmentStudentData = async (
  topic: string,
  assignmentTitle: string,
  studentId: string,
  studentName?: string
): Promise<any> => {
  try {
    // First try with studentId
    let studentRef = ref(database, `assignmentStudents/${topic}/${assignmentTitle}/students/${studentId}`);
    let snapshot = await get(studentRef);
    
    if (snapshot.exists()) {
      return snapshot.val();
    }
    
    // If not found and studentName is provided, try with studentName
    if (studentName && studentName !== studentId) {
      studentRef = ref(database, `assignmentStudents/${topic}/${assignmentTitle}/students/${studentName}`);
      snapshot = await get(studentRef);
      
      if (snapshot.exists()) {
        return snapshot.val();
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching assignment student data:', error);
    return null;
  }
};

// Fetch student's topics by checking topics/{topic}/students/{studentName}
// Optimized: Fetch all topics first, then check in parallel
export const fetchStudentTopics = async (studentName: string): Promise<string[]> => {
  try {
    // First get all topics
    const topicsRef = ref(database, 'topics');
    const topicsSnapshot = await get(topicsRef);
    
    if (!topicsSnapshot.exists()) {
      return [];
    }
    
    const allTopics = topicsSnapshot.val();
    const topicIds = Object.keys(allTopics);
    
    // Check all topics in parallel (larger batch size for better performance)
    const batchSize = 20;
    const studentTopics: string[] = [];
    
    for (let i = 0; i < topicIds.length; i += batchSize) {
      const batch = topicIds.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (topicId) => {
        try {
          const studentInTopicRef = ref(database, `topics/${topicId}/students/${studentName}`);
          const studentSnapshot = await get(studentInTopicRef);
          
          if (studentSnapshot.exists()) {
            return topicId;
          }
          return null;
        } catch (error) {
          // Silently skip errors for faster processing
          return null;
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      studentTopics.push(...batchResults.filter((id): id is string => id !== null));
    }
    
    return studentTopics;
  } catch (error) {
    console.error('Error fetching student topics:', error);
    return [];
  }
};
