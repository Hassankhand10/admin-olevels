# End-to-End Functional Verification

## Test metadata

- Test date: 2026-10-08
- Test time: approximately 11:00–11:15 PKT (Asia/Karachi); browser console timestamps observed around 06:08 UTC
- Tester: Codex
- Local URL tested: http://localhost:5173
- Production URL tested: https://admin.olevels.com
- Test type: read-only functional verification

No student records, assignment records, grades, feedback, approvals, Firebase rules, environment variables, APIs, or deployment settings were modified.

## Status definitions

- PASS: verified working
- FAIL: verified not working or producing an error
- BLOCKED: could not test because of access, safety, or environment limitation
- NOT TESTED: no verification performed

## Overall status

**PARTIALLY VERIFIED**

The application starts locally, the deployed Admin site is reachable, authentication eventually permits access for the existing browser session, routes render, and the AI dashboard displayed live production data in an existing loaded session. Complete end-to-end verification was not possible without safely exercising production writes and resolving observed backend/data-access failures.

## 1. Startup and dependency integrity

| Check | Result | Evidence/notes |
|---|---|---|
| Dependency installation | PASS | npm install --ignore-scripts completed; 407 packages audited; npm reported 0 vulnerabilities. |
| Local Vite startup | PASS | Vite started on http://127.0.0.1:5173. |
| Local application load | PASS | Local Admin page rendered after reload. |
| Production build | BLOCKED | npm run build failed before compilation because esbuild could not spawn under the sandbox: spawn EPERM. No source/configuration change was made. |
| TypeScript | FAIL | Four existing unused-symbol errors in RealtimeDbSizePage.tsx and firebaseService.ts. |
| ESLint | FAIL | 100 errors and 8 warnings, primarily explicit any, unused caught errors, unused symbols, and hook dependency warnings. |

## 2. Authentication and authorization

| Check | Local | Production | Notes |
|---|---|---|---|
| Teacher session detection | PASS | PASS | Existing browser session allowed the application to reach Admin content. |
| Teacher cookie/local-storage handling | NOT TESTED | NOT TESTED | No session was deleted or altered because that could affect the active browser session. |
| /api/auth/exchange | NOT TESTED | BLOCKED | Direct browser evaluation could not call fetch in the automation evaluation context. The normal application flow was observed to complete sufficiently for production access, but the raw request/response was not captured. |
| Firebase custom-token authentication | PASS | PASS | Protected production content loaded using the existing session; token internals were not exposed. |
| Admin authorization | PASS | PASS | Protected production modules loaded for the existing authorized session. The RTDB admin flag was not independently inspected. |
| Non-admin access denial | NOT TESTED | NOT TESTED | No non-admin account was available and no account/session was changed. |
| Invalid/expired session | NOT TESTED | NOT TESTED | No active cookies or local-storage session was invalidated. |
| Redirect behavior | PASS | PASS | /home and unknown routes redirected to /dashboard. |

## 3. Route verification

### Local routes

| Route | Result | Observation |
|---|---|---|
| / | PASS | Admin Portal hub rendered. |
| /dashboard | PASS | Admin Portal hub rendered. |
| /dashboard/weekly-test | FAIL | Page rendered but displayed Error loading courses. |
| /dashboard/student-performance-report | PASS | Page rendered with filters and empty-state metrics. |
| /dashboard/ai-graded-assignments | PASS | Page rendered and showed loading/scanning state. |
| /dashboard/realtime-db-size | PASS | Page rendered; data availability was not confirmed locally. |
| /dashboard/checker-usage | FAIL | Page rendered but displayed Could not load checker usage logs. |
| /home | PASS | Redirected to /dashboard. |
| Unknown route | PASS | Redirected to /dashboard. |

### Production routes

| Route | Result | Observation |
|---|---|---|
| / | PASS | Authentication loading completed and Admin hub rendered. |
| /dashboard | PASS | Admin hub rendered. |
| /dashboard/weekly-test | PASS with issue | Courses loaded successfully and page rendered; Firestore index error was logged and counts were zero/partial. |
| /dashboard/student-performance-report | PASS with issue | Page rendered; it showed no topics/classes and zero metrics in this test. Firestore index error was logged. |
| /dashboard/ai-graded-assignments | PASS with issue | Existing loaded session showed live data including 206 AI-mode assignments, 5,240 submissions, and 4,991 graded. A Firestore index error was also logged. |
| /dashboard/realtime-db-size | FAIL | Page rendered but showed Shallow read failed (401 Unauthorized) and no database rows. |
| /dashboard/checker-usage | PASS with limitation | Page rendered and showed No records to display; raw API status was not captured. |
| /home | PASS | Redirected to /dashboard. |
| Unknown route | PASS | Redirected to /dashboard. |

## 4. Module verification

### Weekly Test / Dashboard

| Functionality | Result | Notes |
|---|---|---|
| Course loading | PASS production | UI displayed Courses loaded successfully. |
| Topic loading | PASS with limitation | Topic-dependent UI rendered, but complete results were affected by a Firestore index error. |
| Live assignments | BLOCKED | Not safely verified as a complete list because the index error caused partial results. |
| Archived assignments | FAIL | Production console reported a missing composite Firestore index for Archived-Assignments. |
| Pending/unmarked papers | PASS with limitation | UI rendered the section, but showed zero in the tested date/data scope. |
| Marked papers | PASS with limitation | UI rendered the section, but showed zero in the tested date/data scope. |
| Student submissions | NOT TESTED | No assignment was opened for a full student read because of the partial data state. |
| Grade updates | BLOCKED | Intentionally not executed against production records. |
| Feedback updates | BLOCKED | Intentionally not executed against production records. |
| Supervision approval | BLOCKED | Intentionally not executed against production records. |
| Main OLevels dashboard links | NOT TESTED | Link presence is visible in source; no external student record was opened. |

### Student Performance Report

| Functionality | Result | Notes |
|---|---|---|
| Classes loading | FAIL | Production page showed zero classes/no classes found. |
| Assignments loading | FAIL | Production page showed zero assignment data. |
| Student submissions | NOT TESTED | No populated student selection was available. |
| Attendance calculations | PASS structurally | Metrics rendered, but no non-empty dataset was available to validate numerical correctness. |
| Assignment statistics | PASS structurally | Metrics rendered, but values were zero. |
| Performance display | PASS structurally | Report UI rendered. |
| Local PDF generation | NOT TESTED | No populated report was available. |
| External PDF-generation endpoint | BLOCKED | Not invoked because no safe populated report/test payload was available and external processing cost/side effects could not be ruled out. |

### AI Graded Assignments

| Functionality | Result | Notes |
|---|---|---|
| AI assignment detection | PASS | Production UI displayed live AI assignments. |
| Status classification | PASS | UI displayed awaiting, evaluation incomplete, ready, in-process, not released, and completed buckets. |
| Live/archived loading | PASS with issue | Live data displayed; archived query errors were logged because of a missing Firestore index. |
| Submission counts | PASS | Production UI showed 5,240 total submissions and per-assignment counts. |
| Grading counts | PASS | Production UI showed 4,991 graded submissions and per-assignment counts. |
| Grading portal links | NOT TESTED | Links were visible but were not opened. |

### Realtime DB Size

| Functionality | Result | Notes |
|---|---|---|
| Branch loading | FAIL | Production displayed 401 Unauthorized for the shallow read and no rows. |
| Shallow reads | FAIL | Explicit UI error: Shallow read failed (401 Unauthorized). |
| Size calculations | NOT TESTED | No branch data was available. |
| Tree expansion | NOT TESTED | No loaded tree was available. |
| Path search | NOT TESTED | No loaded tree was available. |
| Large-branch behavior | BLOCKED | Could not evaluate without successful authorized reads. |

### Checker Usage

| Functionality | Result | Notes |
|---|---|---|
| API request | PASS with limitation | Final production run reached the empty state without an error, but raw response status was not captured. |
| Logs loading | PASS with empty result | UI displayed No records to display. |
| Checker type filter | NOT TESTED | Controls were visible; no result set was available for comparison. |
| Student name filter | NOT TESTED | No test query was submitted. |
| Student ID filter | NOT TESTED | No test query was submitted. |
| Date filter | NOT TESTED | No filter comparison was submitted. |
| Limit handling | NOT TESTED | Source shows a limit of 500; response behavior was not independently verified. |
| Results display | PASS structurally | Empty-state display rendered. |

## 5. Firebase verification

| Area | Result | Notes |
|---|---|---|
| Firebase Auth | PASS indirectly | Protected production content loaded with the existing session. |
| Firestore reads | FAIL/partial | Data rendered in the AI dashboard, but a missing composite index error affected archived assignment queries and other modules. |
| Firestore writes | BLOCKED | No grades, feedback, or approvals were changed because no safe test record/environment was identified. |
| Realtime Database reads | FAIL | Production shallow REST read returned 401 Unauthorized. |
| Expected collections/paths | PARTIAL | Source confirms expected collections/paths; runtime access was only partially successful. |
| Important write operations | BLOCKED | Deliberately not executed in production. |

## 6. API verification

| Endpoint | Result | Notes |
|---|---|---|
| POST /api/auth/exchange | BLOCKED | The normal protected flow succeeded for the existing session, but direct request/response capture was blocked by the browser evaluation context. |
| GET /api/admin/getAllCourses | PASS production | Weekly Test UI reported Courses loaded successfully. |
| GET /api/admin/checker-usage-logs | PASS with empty result | Final production UI reached the empty state without an error; raw status/body was not captured. |
| POST /api/openai/generatePdfFromAssistant | BLOCKED | Not invoked because no safe populated test report was available and external processing cost/side effects could not be ruled out. |

## 7. Error handling

| Scenario | Result | Evidence |
|---|---|---|
| API failure | PASS | Local Checker Usage displayed a user-facing failure message. |
| Firebase/Firestore failure | PASS | Production UI continued rendering and logged a missing-index error while preserving other results. |
| Missing data | PASS | Student report and checker modules rendered empty states. |
| Unauthorized access/data | PASS | Realtime DB module displayed a clear 401 shallow-read failure. |
| Invalid session | NOT TESTED | No active session was invalidated. |
| Empty results | PASS | Empty states rendered in Student Performance and Checker Usage. |
| Network failure | NOT TESTED | No network was disabled or interrupted. |
| Loading states | PASS | Authentication, refresh, scanning, and loading messages were observed. |

## 8. Issues discovered

### Issue 1 — Missing Firestore composite index

- Status: FAIL
- Severity: High
- Observed in: Production console and weekly/student/AI module behavior
- Evidence: Firestore reported that a query required an index for Archived-Assignments filtering by selectedAssignmentCategory and creationDate.
- Impact: Archived assignment data and dependent reports may be incomplete or unavailable.
- Change made: None.

### Issue 2 — Realtime Database shallow REST read returns 401

- Status: FAIL
- Severity: High
- Observed in: Production Realtime DB Size module
- Evidence: UI displayed Shallow read failed (401 Unauthorized) and no data rows.
- Impact: Shallow-read database inspection and related tree functionality cannot be verified or used in this session.
- Change made: None.

### Issue 3 — Existing static validation failures

- Status: FAIL
- Severity: Medium
- Observed in: Local typecheck/lint
- Evidence: TypeScript reported four errors; ESLint reported 100 errors and 8 warnings.
- Impact: The repository does not currently meet a clean static validation baseline.
- Change made: None.

### Issue 4 — Production data paths are only partially verifiable

- Status: BLOCKED
- Severity: Medium
- Reason: Complete grading, feedback, and approval verification would require writing real production records, which was prohibited without a safe test environment/record.

### Issue 5 — External PDF generation was not exercised

- Status: BLOCKED
- Severity: Medium
- Reason: No populated safe test report was available, and invoking the endpoint may perform external/paid processing.

## 9. Functionality not fully tested

- Non-admin access denial with a real non-admin session
- Invalid and expired session behavior
- Cookie/local-storage removal and re-login flow
- Direct raw /api/auth/exchange request/response capture
- Student-level assignment submission details
- Grade, feedback, and supervision approval writes
- Local and external PDF generation with a populated report
- Realtime Database size calculations and large-branch expansion
- Checker filter behavior with non-empty results
- Full production build, due esbuild spawn EPERM
- Firebase Security Rules and backend implementation

## Conclusion

**Partially verified.**

The Admin website starts locally, the deployed site is reachable, the main routes render, the existing authorized session reaches Admin modules, course loading works in production, and the AI dashboard displays live data. End-to-end functionality is not fully verified because production writes were correctly avoided, the production Realtime Database shallow read returns 401, Firestore archived queries require a missing composite index, and static validation/build checks currently fail. 

