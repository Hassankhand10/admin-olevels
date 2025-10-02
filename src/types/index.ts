export interface Assignment {
  title: string;
  deadline: string;
  totalMarks: string;
  weightage: number;
  selectedAssignmentCategory: string;
  teacherName: string;
  creationDate?: number;
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
