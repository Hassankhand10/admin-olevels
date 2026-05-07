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
  /** Assignment-level AI queue state, e.g. `PENDING` — compared case-insensitively in admin dashboard logic. */
  aiAssignmentStatus?: string;
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

/** Weekly test row: Realtime DB and/or Firestore Archived-Assignments */
export interface WeeklyTestListItem {
  id: string;
  data: Assignment;
  /** Set when this row was loaded from Firestore `Archived-Assignments` */
  archivedFirestoreDocId?: string;
}
