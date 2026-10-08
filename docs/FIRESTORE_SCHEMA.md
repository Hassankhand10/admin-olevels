# Firestore Schema Used by Admin

This is a usage-oriented schema inventory derived from client queries. It is not a complete or authoritative database schema.

## Collections

### `Assignments`

Used for live assignment definitions. Observed fields include:

- `topic` / `topicId`
- `title`
- `selectedAssignmentCategory`
- `creationDate`
- `deadline`
- `gradingDeadline`
- `totalMarks`
- `teacherName`
- `studentsLength`
- `submissions`
- `grading`
- AI-related status and identifier fields, including `aiAssignmentStatus`, `aiAssignmentId`, `aiGradingStatus`, `aiAssignmentProcessingStatus`, `weeklyTestGradingMode`, and `resultStatus`

### `AssignmentStudents`

Used for student-level assignment records. The client addresses documents using an assignment document ID and a nested `students` subcollection. Observed student fields include submission, grading, marks, feedback, attachments, feedback URLs, supervision approval, and timestamps.

### `Archived-Assignments`

Used for archived assignment definitions, especially archived weekly tests. Queries use topic/topicId, category, and creation-date fields.

### `Archived-Assignments-Students`

Used for archived student submissions. The client queries by `assignmentId` and merges chunks of archived student data.

### `Classes`

Used for class/session reporting. Queries use `topic`, `creationDate`, and descending creation-date ordering.

## Writes

The Admin app writes production grading data through Firestore `updateDoc`, including marks, feedback, graded state, supervision approval, and approval timestamps. Archived assignment records are displayed read-only in the weekly test UI.

Document ID encoding and exact field normalization are implemented in `firebaseService.ts`; no independent schema specification exists in the repository.

