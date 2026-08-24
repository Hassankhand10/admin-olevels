export interface Assignment {
  title: string;
  deadline: string;
  gradingDeadline: string;
  totalMarks: string;
  weightage: number;
  selectedAssignmentCategory: string;
  teacherName: string;
  creationDate?: number;
  /** Grading mode for weekly tests / past paper practice. `"ai"` | `"peer"` | undefined. */
  weeklyTestGradingMode?: string;
  /** While AI is grading: typically `AI_GRADING_STATUS_IN_PROCESS` (see `isAiGradingStatusInProcess` in firebaseService). */
  aiGradingStatus?: string;
  /** Assignment-level AI queue state, e.g. `PENDING` / `COMPLETED` — compared case-insensitively in admin dashboard logic. */
  aiAssignmentStatus?: string;
  /** Learning Aide pipeline flag (`completed` when AI assignment creation/processing is done). */
  aiAssignmentProcessingStatus?: string;
  /** External AI assignment record id when linked. With `pending` status, admin shows “evaluation incomplete”. */
  aiAssignmentId?: string | number;
  /** Assignment-doc counter of submissions (teacher portal `submissions` field). */
  submissionCount?: number;
  /** Assignment-doc counter of graded papers (teacher portal `grading` field). */
  gradedCount?: number;
}

export interface StudentSubmission {
  submission: boolean;
  submissionTime: string;
  graded: boolean;
  marks: number;
  feedback: string;
  message?: string;
  supervisionApproval?: string;
  supervisionApprovalDate?: number;
  supervisionVideoUrl?: string;
  category?: string;
  gradedBy?: string;
  gradedAt?: string;
  gradedByTeacher?: string;
  attachments?: Array<{
    name: string;
    url: string;
  }>;
}

export interface AssignmentsData {
  [topic: string]: {
    assignment: {
      [key: string]: Assignment;
    };
  };
}

export interface StudentData {
  [studentName: string]: StudentSubmission;
}

/** Weekly test row: Firestore Assignments and/or Archived-Assignments */
export interface WeeklyTestListItem {
  id: string;
  data: Assignment;
  /** Firestore doc id in `Assignments` (live) or `Archived-Assignments` (archived) */
  firestoreDocId?: string;
  /** @deprecated Use {@link firestoreDocId} — archived rows only */
  archivedFirestoreDocId?: string;
}
