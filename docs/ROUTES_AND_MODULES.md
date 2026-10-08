# Routes and Modules

| Route | Module | Purpose |
|---|---|---|
| `/` | `HomePage` | Admin module hub |
| `/dashboard` | `HomePage` | Hub alias |
| `/dashboard/weekly-test` | `Dashboard` | Weekly test monitoring, student submissions, grading, and approval actions |
| `/dashboard/student-performance-report` | `StudentPerformanceReport` | Student classes, attendance, assignment performance, and PDF reporting |
| `/dashboard/ai-graded-assignments` | `AIGradedAssignments` | AI assignment status, progress, and grading insights |
| `/dashboard/realtime-db-size` | `RealtimeDbSizePage` | Realtime Database branch inspection and size calculations |
| `/dashboard/checker-usage` | `CheckerUsagePage` | Checker/plagiarism activity logs and summaries |
| `/home` | Redirect | Redirects to `/dashboard` |
| `*` | Redirect | Redirects to `/dashboard` |

All main routes use the shared `ProtectedRoute` and `useAuthGuard` flow.

## Shared services

- `firebaseService.ts`: Firestore and Realtime Database reads/writes, assignment filtering, AI status resolution, student data access, and report helpers.
- `olevelsAuth.ts`: session parsing, auth exchange, Firebase sign-in, ID-token retrieval, and fetch authorization injection.
- `authGuard.ts`: teacher-session detection, Firebase sign-in, admin RTDB check, redirects, and logout behavior.
- `realtimeDbSizeScan.ts`: known-root scanning and UTF-8 JSON size calculation.
- `realtimeDbShallow.ts`: shallow Realtime Database REST reads.
- `realtimeDbTreeNodes.ts`: expandable database tree data.

